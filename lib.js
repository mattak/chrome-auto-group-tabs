// Pure helpers shared by the service worker, the options page and tests.

import { validatePattern } from './matcher.js';

export const GITHUB_URL_RE =
  /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/(pull|issues)\/(\d+)(?:[/?#]|$)/;

export const GROUP_COLORS = [
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange',
];

export const ASSIGNEE_KINDS = ['pull', 'issue'];
export const ASSIGNEE_BUCKETS = ['mine', 'others'];

export const DEFAULT_SETTINGS = {
  token: '',
  assignee: {
    pull: {
      mine: { enabled: true, title: 'pr-mine', color: 'green' },
      others: { enabled: true, title: 'pr-others', color: 'grey' },
    },
    issue: {
      mine: { enabled: true, title: 'issue-mine', color: 'cyan' },
      others: { enabled: true, title: 'issue-others', color: 'grey' },
    },
  },
  rules: [],
};

/**
 * Parse a GitHub PR or issue page URL.
 * Returns { owner, repo, number, kind: 'pull' | 'issue' } or null.
 */
export function parseGitHubUrl(url) {
  if (typeof url !== 'string') return null;
  const m = GITHUB_URL_RE.exec(url);
  if (!m) return null;
  return {
    owner: m[1],
    repo: m[2],
    kind: m[3] === 'pull' ? 'pull' : 'issue',
    number: Number(m[4]),
  };
}

/** Parse a GitHub PR page URL. Returns {owner, repo, number} or null. */
export function parsePrUrl(url) {
  const r = parseGitHubUrl(url);
  if (!r || r.kind !== 'pull') return null;
  return { owner: r.owner, repo: r.repo, number: r.number };
}

/** True when `login` appears in the item's assignee list. */
export function isAssignedTo(item, login) {
  if (!item || !Array.isArray(item.assignees) || !login) return false;
  const target = login.toLowerCase();
  return item.assignees.some(
    (a) => a && typeof a.login === 'string' && a.login.toLowerCase() === target,
  );
}

/** Pick the bucket ('mine' | 'others') for a PR or issue. */
export function classifyPr(item, login) {
  return isAssignedTo(item, login) ? 'mine' : 'others';
}

function normalizeGroup(src, fallback) {
  const s = src && typeof src === 'object' ? src : {};
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : fallback.enabled,
    title:
      typeof s.title === 'string' && s.title.trim() ? s.title.trim() : fallback.title,
    color: GROUP_COLORS.includes(s.color) ? s.color : fallback.color,
  };
}

function normalizeRule(src) {
  const s = src && typeof src === 'object' ? src : {};
  const pattern = typeof s.pattern === 'string' ? s.pattern.trim() : '';
  const title = typeof s.title === 'string' ? s.title.trim() : '';
  if (!pattern || !title) return null;
  return {
    pattern,
    title,
    color: GROUP_COLORS.includes(s.color) ? s.color : 'grey',
  };
}

/**
 * Merge stored settings over defaults, ignoring unknown or malformed keys.
 * Also understands the v0.1 layout `{ token, mine, others }`.
 */
export function normalizeSettings(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const assigneeSrc = s.assignee && typeof s.assignee === 'object' ? s.assignee : {};

  // v0.1 migration: top-level mine/others were the PR groups.
  const legacyPull =
    !assigneeSrc.pull && (s.mine || s.others) ? { mine: s.mine, others: s.others } : null;

  const assignee = {};
  for (const kind of ASSIGNEE_KINDS) {
    const src = kind === 'pull' && legacyPull ? legacyPull : assigneeSrc[kind];
    const srcObj = src && typeof src === 'object' ? src : {};
    assignee[kind] = {};
    for (const bucket of ASSIGNEE_BUCKETS) {
      assignee[kind][bucket] = normalizeGroup(
        srcObj[bucket],
        DEFAULT_SETTINGS.assignee[kind][bucket],
      );
    }
  }

  const rules = Array.isArray(s.rules) ? s.rules.map(normalizeRule).filter(Boolean) : [];

  return {
    token: typeof s.token === 'string' ? s.token.trim() : '',
    assignee,
    rules,
  };
}

/** Titles of the assignee groups that are enabled. */
export function assigneeGroupTitles(settings) {
  const titles = [];
  for (const kind of ASSIGNEE_KINDS) {
    for (const bucket of ASSIGNEE_BUCKETS) {
      const g = settings.assignee[kind][bucket];
      if (g.enabled) titles.push(g.title);
    }
  }
  return titles;
}

/** Returns [{ index, message }] for rules whose pattern does not compile. */
export function findInvalidRules(rules) {
  const problems = [];
  rules.forEach((rule, index) => {
    const message = validatePattern(rule.pattern);
    if (message) problems.push({ index, message });
  });
  return problems;
}
