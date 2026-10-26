import { GROUP_COLORS, normalizeSettings } from './lib.js';
import { fetchLogin } from './github.js';

const $ = (id) => document.getElementById(id);
const status = $('status');

function setStatus(text, cls) {
  status.textContent = text;
  status.className = cls || '';
}

function fillColors(select) {
  for (const c of GROUP_COLORS) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  }
}

function readForm() {
  return normalizeSettings({
    token: $('token').value,
    mine: { title: $('mine-title').value, color: $('mine-color').value },
    others: { title: $('others-title').value, color: $('others-color').value },
  });
}

function writeForm(s) {
  $('token').value = s.token;
  $('mine-title').value = s.mine.title;
  $('mine-color').value = s.mine.color;
  $('others-title').value = s.others.title;
  $('others-color').value = s.others.color;
}

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  writeForm(normalizeSettings(settings));
}

$('save').addEventListener('click', async () => {
  const settings = readForm();
  await chrome.storage.local.remove('loginCache');
  await chrome.storage.local.set({ settings });
  setStatus('Saved.', 'ok');
});

$('test').addEventListener('click', async () => {
  const { token } = readForm();
  if (!token) {
    setStatus('Enter a token first.', 'err');
    return;
  }
  setStatus('Checking...');
  try {
    const login = await fetchLogin(token);
    setStatus(`OK: authenticated as ${login}`, 'ok');
  } catch (e) {
    setStatus(`Failed: ${e.message}`, 'err');
  }
});

$('sweep').addEventListener('click', async () => {
  setStatus('Scanning...');
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: 'sweep' });
  } catch (e) {
    setStatus(`Failed to reach service worker: ${e.message}`, 'err');
    return;
  }
  if (!res || !res.ok) {
    setStatus(`Scan failed: ${res && res.error ? res.error : 'no response'}`, 'err');
    return;
  }
  if (res.results.length === 0) {
    setStatus('No open PR tabs found (looked for https://github.com/*/*/pull/*).', 'err');
    return;
  }
  const lines = res.results.map((r) => `${r.outcome}\n    ${r.url}`);
  const hasError = res.results.some((r) => r.outcome.startsWith('error'));
  setStatus(`${res.results.length} PR tab(s):\n${lines.join('\n')}`, hasError ? 'err' : 'ok');
});

fillColors($('mine-color'));
fillColors($('others-color'));
load();
