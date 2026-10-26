// Ported from Auto-Group Tabs' src/test/unit/generate-matcher.test.ts so
// rules copied from that extension behave identically here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileMatcher, compileRules, matchRules, validatePattern } from '../matcher.js';

const yes = (re, url) => assert.equal(re.test(url), true, `expected match: ${url}`);
const no = (re, url) => assert.equal(re.test(url), false, `expected no match: ${url}`);

test('no-wildcard domain pattern', () => {
  const re = compileMatcher('example.com');
  yes(re, 'http://example.com/');
  yes(re, 'https://example.com/');
  yes(re, 'https://example.com/any/path?q=1');
  no(re, 'ftp://example.com/');
  no(re, 'file:///example.com/');
  no(re, 'https://www.example.com/');
  no(re, 'http://invalid.com/');
});

test('no-wildcard scheme + host', () => {
  const re = compileMatcher('https://example.com');
  yes(re, 'https://example.com/');
  no(re, 'http://example.com/');
  no(re, 'ftp://example.com/');
  no(re, 'https://www.example.com/');
});

test('no-wildcard scheme + host + root path', () => {
  const re = compileMatcher('https://example.com/');
  yes(re, 'https://example.com/');
  no(re, 'https://example.com/with/path');
  no(re, 'http://example.com/');
});

test('match-all pattern', () => {
  const re = compileMatcher('*');
  yes(re, '');
  yes(re, 'chrome://settings');
  yes(re, 'file:///');
  yes(re, 'https://example.com:8080/');
});

test('scheme wildcard', () => {
  const re = compileMatcher('*://example.com');
  yes(re, 'http://example.com/');
  yes(re, 'https://example.com/with/path/');
  no(re, 'ftp://example.com/');
  no(re, 'https://invalid.com/');
});

test('subdomain wildcard', () => {
  const re = compileMatcher('*.example.com');
  yes(re, 'http://example.com/');
  yes(re, 'https://example.com/with/path/');
  yes(re, 'https://sub.example.com/');
  no(re, 'ftp://example.com/');
  no(re, 'https://invalid.com/');
});

test('domain wildcard', () => {
  const re = compileMatcher('*.com');
  yes(re, 'https://example.com/');
  no(re, 'https://example.de/');
});

test('path wildcard crosses slashes', () => {
  const re = compileMatcher('example.com/foo/*');
  yes(re, 'https://example.com/foo/');
  yes(re, 'https://example.com/foo/bar/baz');
  no(re, 'http://example.com/bar/');
  no(re, 'https://invalid.com/foo/');
});

test('simple scheme (chrome://, file://)', () => {
  const re = compileMatcher('file:///foo/*');
  yes(re, 'file:///foo/');
  yes(re, 'file:///foo/bar.txt');
  no(re, 'file:///bar/baz');
  no(re, 'https://example.com/foo/');

  const chrome = compileMatcher('chrome://*');
  yes(chrome, 'chrome://extensions');
  yes(chrome, 'chrome://settings/privacy');
  no(chrome, 'https://example.com/');
});

test('port handling', () => {
  yes(compileMatcher('localhost'), 'http://localhost:3000/');
  yes(compileMatcher('localhost:3000'), 'http://localhost:3000/');
  no(compileMatcher('localhost:3000'), 'http://localhost:4000/');
});

test('regular expressions', () => {
  const re = compileMatcher('/^fo.?/i');
  yes(re, 'foo');
  yes(re, 'Foo');
  no(re, 'iFoo');

  const gh = compileMatcher('/^https?:\\/\\/github\\.com(?!\\/[^/]+\\/[^/]+\\/pull\\/\\d+)/');
  yes(gh, 'https://github.com/o/r');
  yes(gh, 'https://github.com/o/r/pulls');
  no(gh, 'https://github.com/o/r/pull/12');
});

test('invalid patterns', () => {
  assert.throws(() => compileMatcher('/(unclosed parens/'));
  assert.throws(() => compileMatcher('/unfinished'));
  assert.throws(() => compileMatcher(''));
  assert.equal(validatePattern('example.com'), null);
  assert.equal(typeof validatePattern('/(/'), 'string');
});

test('rule list: first match wins, invalid rules skipped', () => {
  const rules = [
    { pattern: 'github.com/*/*/pull/*', title: 'pr', color: 'green' },
    { pattern: '/(/', title: 'broken', color: 'red' },
    { pattern: 'github.com', title: 'gh', color: 'grey' },
    { pattern: '*', title: 'rest', color: 'blue' },
  ];
  const compiled = compileRules(rules);
  assert.equal(compiled.length, 3);
  assert.equal(matchRules(compiled, 'https://github.com/o/r/pull/1').title, 'pr');
  assert.equal(matchRules(compiled, 'https://github.com/o/r').title, 'gh');
  assert.equal(matchRules(compiled, 'https://example.com/').title, 'rest');
  assert.equal(matchRules(compiled, undefined), null);
});
