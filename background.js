import {
  assigneeGroupTitles,
  classifyPr,
  normalizeSettings,
  parseGitHubUrl,
} from './lib.js';
import { compileRules, matchRules } from './matcher.js';
import { fetchIssue, fetchLogin } from './github.js';

// Assignee lookups are cached briefly so moving between /files, /commits and
// the conversation tab of one PR does not hit the API every time.
const CLASSIFY_CACHE_TTL_MS = 5 * 60 * 1000;
const classifyCache = new Map(); // "owner/repo#number" -> { bucket, expires }

let settingsCache = null; // { settings, compiledRules }

async function loadSettings() {
  if (settingsCache) return settingsCache;
  const { settings } = await chrome.storage.local.get('settings');
  const normalized = normalizeSettings(settings);
  settingsCache = { settings: normalized, compiledRules: compileRules(normalized.rules) };
  return settingsCache;
}

async function getLogin(token) {
  const { loginCache } = await chrome.storage.local.get('loginCache');
  if (loginCache && loginCache.token === token && loginCache.login) {
    return loginCache.login;
  }
  const login = await fetchLogin(token);
  await chrome.storage.local.set({ loginCache: { token, login } });
  return login;
}

async function classifyTarget(token, target) {
  const key = `${target.owner}/${target.repo}#${target.number}`;
  const hit = classifyCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.bucket;

  const login = await getLogin(token);
  const data = await fetchIssue(token, target);
  const bucket = classifyPr(data, login);
  classifyCache.set(key, { bucket, expires: Date.now() + CLASSIFY_CACHE_TTL_MS });
  return bucket;
}

async function findOrCreateGroup(tab, { title, color }) {
  const existing = await chrome.tabGroups.query({ windowId: tab.windowId, title });
  if (existing.length > 0) {
    const group = existing[0];
    if (tab.groupId !== group.id) {
      await chrome.tabs.group({ tabIds: [tab.id], groupId: group.id });
    }
    if (group.color !== color) {
      await chrome.tabGroups.update(group.id, { color });
    }
    return group.id;
  }
  const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
  await chrome.tabGroups.update(groupId, { title, color });
  return groupId;
}

// Ungroup a tab that left a PR/issue page, but only if it currently sits in
// one of the assignee groups. Tabs in URL-rule groups stay where they are
// (same default as Auto-Group Tabs); tabs in groups owned by the user or
// other extensions are never touched.
async function ungroupIfAssigneeGroup(tab, settings) {
  if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return false;
  let group;
  try {
    group = await chrome.tabGroups.get(tab.groupId);
  } catch {
    return false;
  }
  if (!assigneeGroupTitles(settings).includes(group.title)) return false;
  try {
    await chrome.tabs.ungroup(tab.id);
    return true;
  } catch (e) {
    console.debug('ungroup failed', e);
    return false;
  }
}

/** Decide where a tab belongs. Returns { group } | { ungroup: true } | { skip: reason } | { error }. */
async function decide(tab, { settings, compiledRules }) {
  // 1. Assignee classification always wins over URL rules, so a broad
  //    "github.com" rule cannot swallow PR/issue tabs.
  const target = parseGitHubUrl(tab.url);
  if (target) {
    if (!settings.token) return { error: 'no token configured' };
    let bucket;
    try {
      bucket = await classifyTarget(settings.token, target);
    } catch (e) {
      console.warn('Could not classify', tab.url, e);
      return { error: e.message };
    }
    const group = settings.assignee[target.kind][bucket];
    if (group.enabled) return { group };
    // Disabled bucket: fall through to URL rules.
  }

  // 2. URL rules, first match wins.
  const rule = matchRules(compiledRules, tab.url);
  if (rule) return { group: rule };

  return { ungroup: true };
}

// Returns a short human-readable outcome so the options page can show it.
async function handleTab(tab) {
  if (!tab || tab.id === undefined) return 'skipped: no tab';
  if (tab.pinned) return 'skipped: pinned';
  if (!tab.url) return 'skipped: no url';

  const loaded = await loadSettings();
  const decision = await decide(tab, loaded);

  if (decision.error) return `error: ${decision.error}`;
  if (decision.skip) return `skipped: ${decision.skip}`;

  // Re-read the tab: the user may have navigated again while we waited.
  let fresh;
  try {
    fresh = await chrome.tabs.get(tab.id);
  } catch {
    return 'skipped: tab closed';
  }
  if (fresh.url !== tab.url) return 'skipped: tab navigated away';

  if (decision.ungroup) {
    const did = await ungroupIfAssigneeGroup(fresh, loaded.settings);
    return did ? 'ungrouped' : 'skipped: no matching rule';
  }

  try {
    await findOrCreateGroup(fresh, decision.group);
    return `grouped: ${decision.group.title}`;
  } catch (e) {
    console.warn('Could not group tab', tab.url, e);
    return `error: ${e.message}`;
  }
}

async function sweepAllTabs() {
  const tabs = await chrome.tabs.query({});
  const results = [];
  for (const tab of tabs) {
    const outcome = await handleTab(tab);
    results.push({ url: tab.url || '', outcome });
  }
  return results;
}

// Navigation events are handled one at a time. Two tabs for the same group
// arriving together would otherwise both see "no group yet" and create two.
let queue = Promise.resolve();
function enqueue(tab) {
  const run = queue.then(() => handleTab(tab)).catch((e) => {
    console.warn('handleTab failed', e);
  });
  queue = run;
  return run;
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  enqueue(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  sweepAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  sweepAllTabs();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    settingsCache = null;
    classifyCache.clear();
    sweepAllTabs();
  }
});

// Used by the options page "Re-scan open tabs" button.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sweep') {
    settingsCache = null;
    sweepAllTabs()
      .then((results) => sendResponse({ ok: true, results }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  return false;
});
