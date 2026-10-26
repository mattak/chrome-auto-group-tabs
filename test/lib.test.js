import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPr, isAssignedTo, normalizeSettings, parsePrUrl } from '../lib.js';

test('parsePrUrl matches PR pages and sub-pages', () => {
  assert.deepEqual(parsePrUrl('https://github.com/o/r/pull/12'), { owner: 'o', repo: 'r', number: 12 });
  assert.deepEqual(parsePrUrl('https://github.com/o/r/pull/12/files'), { owner: 'o', repo: 'r', number: 12 });
  assert.deepEqual(parsePrUrl('https://github.com/o/r/pull/12?diff=split#x'), { owner: 'o', repo: 'r', number: 12 });
  assert.deepEqual(parsePrUrl('https://github.com/octo-org/hello-world/pull/1970'), {
    owner: 'octo-org', repo: 'hello-world', number: 1970,
  });
});

test('parsePrUrl rejects non-PR urls', () => {
  for (const u of [
    'https://github.com/o/r/pulls',
    'https://github.com/o/r/issues/12',
    'https://github.com/o/r/pull/abc',
    'https://github.com/pulls?q=assignee:@me',
    'http://github.com/o/r/pull/12',
    'https://gist.github.com/o/r/pull/12',
    undefined,
    '',
  ]) {
    assert.equal(parsePrUrl(u), null, String(u));
  }
});

test('isAssignedTo is case-insensitive and tolerant of bad data', () => {
  const pr = { assignees: [{ login: 'Alice' }, { login: 'bob' }] };
  assert.equal(isAssignedTo(pr, 'alice'), true);
  assert.equal(isAssignedTo(pr, 'BOB'), true);
  assert.equal(isAssignedTo(pr, 'carol'), false);
  assert.equal(isAssignedTo({}, 'alice'), false);
  assert.equal(isAssignedTo(null, 'alice'), false);
  assert.equal(isAssignedTo(pr, ''), false);
});

test('classifyPr', () => {
  assert.equal(classifyPr({ assignees: [{ login: 'me' }] }, 'me'), 'mine');
  assert.equal(classifyPr({ assignees: [{ login: 'you' }] }, 'me'), 'others');
  assert.equal(classifyPr({ assignees: [] }, 'me'), 'others');
});

test('normalizeSettings falls back to defaults', () => {
  const s = normalizeSettings({ token: ' t ', mine: { title: ' ', color: 'nope' }, others: 'junk' });
  assert.equal(s.token, 't');
  assert.deepEqual(s.mine, { title: 'pr-mine', color: 'green' });
  assert.deepEqual(s.others, { title: 'pr-others', color: 'grey' });
  assert.deepEqual(normalizeSettings(undefined).mine, { title: 'pr-mine', color: 'green' });
});
