import {
  ASSIGNEE_BUCKETS,
  ASSIGNEE_KINDS,
  GROUP_COLORS,
  findInvalidRules,
  normalizeSettings,
} from './lib.js';
import { validatePattern } from './matcher.js';
import { fetchLogin } from './github.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const rulesBody = document.querySelector('#rules tbody');
const rulesJson = $('rules-json');

function setStatus(text, cls) {
  status.textContent = text;
  status.className = cls || '';
}

function colorSelect(value) {
  const select = document.createElement('select');
  for (const c of GROUP_COLORS) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  }
  select.value = value;
  return select;
}

function fillColors(select) {
  for (const c of GROUP_COLORS) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  }
}

// ---- assignee groups ------------------------------------------------------

function readAssignee() {
  const assignee = {};
  for (const kind of ASSIGNEE_KINDS) {
    assignee[kind] = {};
    for (const bucket of ASSIGNEE_BUCKETS) {
      assignee[kind][bucket] = {
        enabled: $(`${kind}-${bucket}-enabled`).checked,
        title: $(`${kind}-${bucket}-title`).value,
        color: $(`${kind}-${bucket}-color`).value,
      };
    }
  }
  return assignee;
}

function writeAssignee(assignee) {
  for (const kind of ASSIGNEE_KINDS) {
    for (const bucket of ASSIGNEE_BUCKETS) {
      const g = assignee[kind][bucket];
      $(`${kind}-${bucket}-enabled`).checked = g.enabled;
      $(`${kind}-${bucket}-title`).value = g.title;
      $(`${kind}-${bucket}-color`).value = g.color;
    }
  }
}

// ---- URL rules ------------------------------------------------------------

function ruleRow(rule) {
  const tr = document.createElement('tr');

  const tdPattern = document.createElement('td');
  tdPattern.className = 'pattern';
  const pattern = document.createElement('input');
  pattern.type = 'text';
  pattern.value = rule.pattern;
  pattern.placeholder = 'example.com/*';
  pattern.spellcheck = false;
  const err = document.createElement('div');
  err.className = 'rule-error';
  pattern.addEventListener('input', () => {
    const message = pattern.value.trim() ? validatePattern(pattern.value.trim()) : null;
    pattern.classList.toggle('invalid', Boolean(message));
    err.textContent = message || '';
  });
  tdPattern.append(pattern, err);

  const tdTitle = document.createElement('td');
  const title = document.createElement('input');
  title.type = 'text';
  title.value = rule.title;
  title.placeholder = 'group title';
  tdTitle.appendChild(title);

  const tdColor = document.createElement('td');
  tdColor.appendChild(colorSelect(rule.color));

  const tdActions = document.createElement('td');
  tdActions.className = 'actions';
  const up = document.createElement('button');
  up.type = 'button'; up.className = 'icon'; up.title = 'Move up'; up.textContent = '↑';
  up.addEventListener('click', () => { if (tr.previousElementSibling) rulesBody.insertBefore(tr, tr.previousElementSibling); });
  const down = document.createElement('button');
  down.type = 'button'; down.className = 'icon'; down.title = 'Move down'; down.textContent = '↓';
  down.addEventListener('click', () => { if (tr.nextElementSibling) rulesBody.insertBefore(tr.nextElementSibling, tr); });
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'icon'; del.title = 'Delete'; del.textContent = '✕';
  del.addEventListener('click', () => tr.remove());
  tdActions.append(up, down, del);

  tr.append(tdPattern, tdTitle, tdColor, tdActions);
  return tr;
}

function readRules() {
  const rules = [];
  for (const tr of rulesBody.querySelectorAll('tr')) {
    const [pattern, title] = tr.querySelectorAll('input');
    const color = tr.querySelector('select').value;
    if (!pattern.value.trim() && !title.value.trim()) continue; // empty row
    rules.push({ pattern: pattern.value.trim(), title: title.value.trim(), color });
  }
  return rules;
}

function writeRules(rules) {
  rulesBody.replaceChildren(...rules.map(ruleRow));
}

function addRule(rule = { pattern: '', title: '', color: 'grey' }) {
  const tr = ruleRow(rule);
  rulesBody.appendChild(tr);
  tr.querySelector('input').focus();
}

// ---- settings I/O ---------------------------------------------------------

function readForm() {
  return {
    token: $('token').value,
    assignee: readAssignee(),
    rules: readRules(),
  };
}

function writeForm(s) {
  $('token').value = s.token;
  writeAssignee(s.assignee);
  writeRules(s.rules);
}

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  writeForm(normalizeSettings(settings));
}

$('save').addEventListener('click', async () => {
  const raw = readForm();
  const incomplete = raw.rules.filter((r) => !r.pattern || !r.title);
  if (incomplete.length) {
    setStatus('Every rule needs both a pattern and a group title.', 'err');
    return;
  }
  const invalid = findInvalidRules(raw.rules);
  if (invalid.length) {
    setStatus(
      invalid.map((p) => `Rule ${p.index + 1}: ${p.message}`).join('\n'),
      'err',
    );
    return;
  }
  const settings = normalizeSettings(raw);
  await chrome.storage.local.remove('loginCache');
  await chrome.storage.local.set({ settings });
  writeForm(settings);
  setStatus('Saved. Open tabs are being re-scanned.', 'ok');
});

$('test').addEventListener('click', async () => {
  const token = $('token').value.trim();
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
  const shown = res.results.filter((r) => !r.outcome.startsWith('skipped'));
  const lines = shown.map((r) => `${r.outcome}\n    ${r.url}`);
  const hasError = shown.some((r) => r.outcome.startsWith('error'));
  const header = `${res.results.length} tab(s) scanned, ${shown.length} acted on`;
  setStatus(lines.length ? `${header}:\n${lines.join('\n')}` : `${header}.`, hasError ? 'err' : 'ok');
});

$('add-rule').addEventListener('click', () => addRule());

$('export-rules').addEventListener('click', () => {
  rulesJson.hidden = false;
  rulesJson.value = JSON.stringify(readRules(), null, 2);
  rulesJson.focus();
  rulesJson.select();
});

$('import-rules').addEventListener('click', () => {
  if (rulesJson.hidden) {
    rulesJson.hidden = false;
    rulesJson.value = '';
    rulesJson.focus();
    setStatus('Paste a JSON array of {pattern, title, color} and click Import JSON again.');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(rulesJson.value);
  } catch (e) {
    setStatus(`Invalid JSON: ${e.message}`, 'err');
    return;
  }
  if (!Array.isArray(parsed)) {
    setStatus('JSON must be an array.', 'err');
    return;
  }
  const rules = normalizeSettings({ rules: parsed }).rules;
  writeRules(rules);
  rulesJson.hidden = true;
  setStatus(`Imported ${rules.length} rule(s). Click Save to apply.`, 'ok');
});

for (const kind of ASSIGNEE_KINDS) {
  for (const bucket of ASSIGNEE_BUCKETS) {
    fillColors($(`${kind}-${bucket}-color`));
  }
}
load();
