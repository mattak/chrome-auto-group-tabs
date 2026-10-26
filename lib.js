// Pure helpers shared by the service worker, the options page and tests.

export const PR_URL_RE =
  /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/pull\/(\d+)(?:[/?#]|$)/;

export const DEFAULT_SETTINGS = {
  token: '',
  mine: { title: 'pr-mine', color: 'green' },
  others: { title: 'pr-others', color: 'grey' },
};

export const GROUP_COLORS = [
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange',
];

/** Parse a GitHub PR page URL. Returns {owner, repo, number} or null. */
export function parsePrUrl(url) {
  if (typeof url !== 'string') return null;
  const m = PR_URL_RE.exec(url);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/** True when `login` appears in the PR's assignee list. */
export function isAssignedTo(pr, login) {
  if (!pr || !Array.isArray(pr.assignees) || !login) return false;
  const target = login.toLowerCase();
  return pr.assignees.some(
    (a) => a && typeof a.login === 'string' && a.login.toLowerCase() === target,
  );
}

/** Pick the group kind ('mine' | 'others') for a PR. */
export function classifyPr(pr, login) {
  return isAssignedTo(pr, login) ? 'mine' : 'others';
}

/** Merge stored settings over defaults, ignoring unknown or malformed keys. */
export function normalizeSettings(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const pick = (kind) => {
    const src = s[kind] && typeof s[kind] === 'object' ? s[kind] : {};
    const title =
      typeof src.title === 'string' && src.title.trim()
        ? src.title.trim()
        : DEFAULT_SETTINGS[kind].title;
    const color = GROUP_COLORS.includes(src.color)
      ? src.color
      : DEFAULT_SETTINGS[kind].color;
    return { title, color };
  };
  return {
    token: typeof s.token === 'string' ? s.token.trim() : '',
    mine: pick('mine'),
    others: pick('others'),
  };
}
