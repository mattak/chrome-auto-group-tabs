import { classifyPr, normalizeSettings, parsePrUrl } from './lib.js';
import { fetchLogin, fetchPullRequest } from './github.js';

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return normalizeSettings(settings);
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

// Ungroup a tab that left a PR page, but only if it currently sits in one of
// our own groups. Tabs in groups owned by the user or other extensions are
// never touched.
async function ungroupIfOurs(tab, settings) {
  if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return;
  let group;
  try {
    group = await chrome.tabGroups.get(tab.groupId);
  } catch {
    return;
  }
  const ours = [settings.mine.title, settings.others.title];
  if (!ours.includes(group.title)) return;
  try {
    await chrome.tabs.ungroup(tab.id);
  } catch (e) {
    console.debug('ungroup failed', e);
  }
}

// Returns a short human-readable outcome so the options page can show it.
async function handleTab(tab) {
  if (!tab || tab.id === undefined) return 'skipped: no tab';
  if (tab.pinned) return 'skipped: pinned';

  const settings = await loadSettings();

  const pr = parsePrUrl(tab.url);
  if (!pr) {
    await ungroupIfOurs(tab, settings);
    return 'skipped: not a PR url';
  }

  if (!settings.token) {
    console.debug('No GitHub token configured; skipping', tab.url);
    return 'error: no token configured';
  }

  let kind;
  try {
    const login = await getLogin(settings.token);
    const data = await fetchPullRequest(settings.token, pr);
    kind = classifyPr(data, login);
  } catch (e) {
    console.warn('Could not classify PR', tab.url, e);
    return `error: ${e.message}`;
  }

  // Re-read the tab: the user may have navigated again while we waited.
  let fresh;
  try {
    fresh = await chrome.tabs.get(tab.id);
  } catch {
    return 'skipped: tab closed';
  }
  if (fresh.url !== tab.url) return 'skipped: tab navigated away';

  try {
    await findOrCreateGroup(fresh, settings[kind]);
    return `grouped: ${settings[kind].title}`;
  } catch (e) {
    console.warn('Could not group tab', tab.url, e);
    return `error: ${e.message}`;
  }
}

async function sweepAllTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://github.com/*/*/pull/*' });
  const results = [];
  for (const tab of tabs) {
    const outcome = await handleTab(tab);
    results.push({ url: tab.url, outcome });
  }
  return results;
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  handleTab(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  sweepAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  sweepAllTabs();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    sweepAllTabs();
  }
});

// Used by the options page "Re-scan open tabs" button.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sweep') {
    sweepAllTabs()
      .then((results) => sendResponse({ ok: true, results }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  return false;
});
