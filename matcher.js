// URL pattern matcher with the same semantics as the Auto-Group Tabs
// extension (https://github.com/loilo/auto-group-tabs), so rules can be
// copied over verbatim.
//
//   example.com            https?://example.com with any path
//   *.example.com          same, plus any subdomain
//   example.com/foo/*      path wildcard; "*" also crosses "/"
//   *://example.com        http or https
//   ftp://example.com      literal scheme
//   chrome://*             any other scheme followed by a path glob
//   *                      everything
//   /regex/flags           JavaScript regular expression

const REGEX_PATTERN = /^\/(?<source>.*)\/(?<flags>[dgimsuvy]*)$/;

const MATCHER_PATTERN = new RegExp(
  '^(?:' +
    // Simple case: any scheme other than http/https/ftp/*, followed by a glob.
    '(?<simpleScheme>[a-z][a-z0-9+.\\-]*)(?<!https?|ftp|\\*)://(?<simplePath>.*)' +
    '|' +
    // Complex case: optional scheme, host (with optional credentials/port), optional path.
    '(?:(?<scheme>https?|ftp|\\*)://)?' +
    '(?<host>' +
      '\\*' +
      '|(?:[^@:\\/]+(?::[^@:\\/]+)?@)?' +
      '(?:\\*\\.[^*:\\/]+|[^:\\/]+|\\[[0-9a-f:]+\\])' +
      '(?::[0-9]+)?' +
    ')' +
    '(?:/(?<path>.*))?' +
  ')$',
);

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}

function globToRegexSource(s, asteriskReplacement) {
  return s.split('*').map(escapeRegex).join(asteriskReplacement);
}

export function isRegexPattern(pattern) {
  return typeof pattern === 'string' && pattern.startsWith('/');
}

/** Compile a pattern to a RegExp. Throws on invalid input. */
export function compileMatcher(pattern) {
  if (typeof pattern !== 'string') throw new Error('Pattern must be a string');

  if (isRegexPattern(pattern)) {
    const m = REGEX_PATTERN.exec(pattern);
    if (!m) throw new Error(`Invalid regex pattern: ${pattern}`);
    return new RegExp(m.groups.source, m.groups.flags);
  }

  if (pattern === '*') return /^.*$/;

  const m = MATCHER_PATTERN.exec(pattern);
  if (!m) throw new Error(`Invalid pattern: ${pattern}`);
  const { scheme, host, path, simpleScheme, simplePath } = m.groups;

  if (simpleScheme !== undefined) {
    return new RegExp(`^${escapeRegex(simpleScheme)}://${globToRegexSource(simplePath, '.*')}$`);
  }

  const schemeSource =
    scheme === undefined ? 'https?' : globToRegexSource(scheme, 'https?');

  let hostSource;
  if (host === '*') {
    hostSource = '[^/]+';
  } else if (host.startsWith('*.')) {
    hostSource = globToRegexSource(`*${host.slice(2)}`, '(?:[^/]+\\.)?');
  } else {
    hostSource = escapeRegex(host);
  }
  if (!/:[0-9]+$/.test(host)) {
    hostSource += '(?::[0-9]+)?';
  }

  const pathSource =
    path === undefined ? '(?:/.*)?' : `(?:/${globToRegexSource(path, '.*')})?`;

  return new RegExp(`^${schemeSource}://${hostSource}${pathSource}$`);
}

/** Returns an error message, or null when the pattern is valid. */
export function validatePattern(pattern) {
  try {
    compileMatcher(pattern);
    return null;
  } catch (e) {
    return e.message;
  }
}

/**
 * Compile a rule list once. Rules with invalid patterns are dropped.
 * Returns [{ rule, regexes }].
 */
export function compileRules(rules) {
  const out = [];
  for (const rule of rules) {
    try {
      out.push({ rule, regex: compileMatcher(rule.pattern) });
    } catch {
      // skip invalid rule
    }
  }
  return out;
}

/** First rule whose pattern matches the URL, or null. */
export function matchRules(compiled, url) {
  if (typeof url !== 'string') return null;
  for (const { rule, regex } of compiled) {
    if (regex.test(url)) return rule;
  }
  return null;
}
