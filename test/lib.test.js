import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assigneeGroupTitles,
  classifyPr,
  findInvalidRules,
  isAssignedTo,
  normalizeSettings,
  parseGitHubUrl,
  parsePrUrl,
} from '../lib.js';

test('parseGitHubUrl handles PRs and issues with sub-pages', () => {
  assert.deepEqual(parseGitHubUrl('https://github.com/o/r/pull/12'), { owner: 'o', repo: 'r', kind: 'pull', number: 12 });
  assert.deepEqual(parseGitHubUrl('https://github.com/o/r/pull/12/files'), { owner: 'o', repo: 'r', kind: 'pull', number: 12 });
  assert.deepEqual(parseGitHubUrl('https://github.com/o/r/issues/7?x=1#y'), { owner: 'o', repo: 'r', kind: 'issue', number: 7 });
  assert.deepEqual(parseGitHubUrl('https://github.com/octo-org/hello-world/issues/1966'), {
    owner: 'octo-org', repo: 'hello-world', kind: 'issue', number: 1966,
  });
});

test('parseGitHubUrl rejects other urls', () => {
  for (const u of [
    'https://github.com/o/r/pulls',
    'https://github.com/o/r/issues',
    'https://github.com/o/r/issues/new',
    'https://github.com/o/r/pull/abc',
    'https://github.com/pulls?q=assignee:@me',
    'http://github.com/o/r/pull/12',
    'https://gist.github.com/o/r/pull/12',
    undefined,
    '',
  ]) {
    assert.equal(parseGitHubUrl(u), null, String(u));
  }
});

test('parsePrUrl only returns PRs', () => {
  assert.deepEqual(parsePrUrl('https://github.com/o/r/pull/12'), { owner: 'o', repo: 'r', number: 12 });
  assert.equal(parsePrUrl('https://github.com/o/r/issues/12'), null);
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

test('normalizeSettings: defaults', () => {
  const s = normalizeSettings(undefined);
  assert.equal(s.token, '');
  assert.deepEqual(s.assignee.pull.mine, { enabled: true, title: 'pr-mine', color: 'green' });
  assert.deepEqual(s.assignee.issue.others, { enabled: true, title: 'issue-others', color: 'grey' });
  assert.deepEqual(s.rules, []);
});

test('normalizeSettings: v0.1 layout {token, mine, others} migrates to assignee.pull', () => {
  const s = normalizeSettings({
    token: ' t ',
    mine: { title: 'my-prs', color: 'blue' },
    others: { title: 'their-prs', color: 'nope' },
  });
  assert.equal(s.token, 't');
  assert.deepEqual(s.assignee.pull.mine, { enabled: true, title: 'my-prs', color: 'blue' });
  assert.deepEqual(s.assignee.pull.others, { enabled: true, title: 'their-prs', color: 'grey' });
  assert.deepEqual(s.assignee.issue.mine, { enabled: true, title: 'issue-mine', color: 'cyan' });
});

test('normalizeSettings: rules keep order, drop incomplete, default color', () => {
  const s = normalizeSettings({
    rules: [
      { pattern: ' github.com ', title: 'gh', color: 'purple' },
      { pattern: '', title: 'x' },
      { pattern: 'a.com', title: '' },
      { pattern: 'b.com', title: 'b', color: 'bad' },
      'junk',
    ],
  });
  assert.deepEqual(s.rules, [
    { pattern: 'github.com', title: 'gh', color: 'purple' },
    { pattern: 'b.com', title: 'b', color: 'grey' },
  ]);
});

test('assigneeGroupTitles only lists enabled groups', () => {
  const s = normalizeSettings({
    assignee: { issue: { others: { enabled: false } } },
  });
  assert.deepEqual(assigneeGroupTitles(s), ['pr-mine', 'pr-others', 'issue-mine']);
});

test('findInvalidRules reports index and message', () => {
  const problems = findInvalidRules([
    { pattern: 'ok.com', title: 'a' },
    { pattern: '/(/', title: 'b' },
  ]);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].index, 1);
  assert.equal(typeof problems[0].message, 'string');
});
