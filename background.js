import { classifyPr, normalizeSettings, parsePrUrl } from './lib.js';
import { fetchLogin, fetchPullRequest } from './github.js';

// tabId -> kind ('mine' | 'others') of the group this extension last put the
// tab into. Used to ungroup a tab when it navigates away from a PR page.
// Lives only as long as the service worker; losing it is harmless.
const managedTabs = new Map();

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

async function ungroupIfManaged(tab) {
  if (!managedTabs.has(tab.id)) return;
  managedTabs.delete(tab.id);
  if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return;
  try {
    await chrome.tabs.ungroup(tab.id);
  } catch (e) {
    console.debug('ungroup failed', e);
  }
}

async function handleTab(tab) {
  if (!tab || tab.id === undefined || tab.pinned) return;

  const pr = parsePrUrl(tab.url);
  if (!pr) {
    await ungroupIfManaged(tab);
    return;
  }

  const settings = await loadSettings();
  if (!settings.token) {
    console.debug('No GitHub token configured; skipping', tab.url);
    return;
  }

  let kind;
  try {
    const login = await getLogin(settings.token);
    const data = await fetchPullRequest(settings.token, pr);
    kind = classifyPr(data, login);
  } catch (e) {
    console.warn('Could not classify PR', tab.url, e);
    return;
  }

  // Re-read the tab: the user may have navigated again while we waited.
  let fresh;
  try {
    fresh = await chrome.tabs.get(tab.id);
  } catch {
    return;
  }
  if (fresh.url !== tab.url) return;

  try {
    await findOrCreateGroup(fresh, settings[kind]);
    managedTabs.set(fresh.id, kind);
  } catch (e) {
    console.warn('Could not group tab', tab.url, e);
  }
}

async function sweepAllTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://github.com/*/*/pull/*' });
  for (const tab of tabs) {
    await handleTab(tab);
  }
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  handleTab(tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  managedTabs.delete(tabId);
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
    sweepAllTabs().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
