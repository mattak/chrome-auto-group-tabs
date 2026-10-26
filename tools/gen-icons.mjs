// Renders a pull-request glyph on a dark rounded square and writes PNGs.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
mkdirSync(outDir, { recursive: true });

const BG = [0x24, 0x29, 0x2f];      // GitHub dark
const FG = [0xf0, 0xf6, 0xfc];      // near white
const ACCENT = [0x3f, 0xb9, 0x50];  // GitHub green (assigned-to-me hint)

const seg = (ax, ay, bx, by, w) => ({ type: 'seg', ax, ay, bx, by, w });
const circle = (cx, cy, r, color) => ({ type: 'circle', cx, cy, r, color });

// Coordinates in 0..1 unit square.
const SHAPES = [
  seg(0.30, 0.25, 0.30, 0.75, 0.085),            // left trunk
  seg(0.30, 0.25, 0.52, 0.25, 0.085),            // branch out
  seg(0.52, 0.25, 0.70, 0.43, 0.085),            // diagonal down
  seg(0.70, 0.43, 0.70, 0.60, 0.085),            // into right node
  circle(0.30, 0.25, 0.11, FG),
  circle(0.30, 0.75, 0.11, FG),
  circle(0.70, 0.75, 0.13, ACCENT),
];

function distSeg(px, py, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = s.ax + t * dx, y = s.ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function roundedSquareInside(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function sample(x, y) {
  if (!roundedSquareInside(x, y, 0.2)) return [0, 0, 0, 0];
  let color = BG;
  for (const s of SHAPES) {
    if (s.type === 'seg') {
      if (distSeg(x, y, s) <= s.w / 2) color = FG;
    } else if (Math.hypot(x - s.cx, y - s.cy) <= s.r) {
      color = s.color;
    }
  }
  return [...color, 255];
}

function render(size, ss = 4) {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      px[i + 3] = Math.round(a / n);
      if (a) { px[i] = Math.round(r / a); px[i + 1] = Math.round(g / a); px[i + 2] = Math.round(b / a); }
    }
  }
  return px;
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon${size}.png`), png(size, render(size, size <= 32 ? 8 : 4)));
  console.log(`icon${size}.png`);
}
