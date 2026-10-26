// Checks a GitHub token the same way the extension uses it.
//
//   GITHUB_TOKEN=github_pat_... node tools/check-token.mjs <owner>/<repo>/pull/<n> [...]
//   node tools/check-token.mjs --token github_pat_... https://github.com/o/r/pull/1
//
// Exit code 0 when every lookup succeeds, 1 otherwise.

import { fetchIssue, fetchLogin } from '../github.js';
import { classifyPr, parseGitHubUrl } from '../lib.js';

function parseArgs(argv) {
  let token = process.env.GITHUB_TOKEN || '';
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--token') {
      token = argv[++i] || '';
    } else {
      targets.push(argv[i]);
    }
  }
  return { token, targets };
}

function toUrl(t) {
  return /^https?:\/\//.test(t) ? t : `https://github.com/${t.replace(/^\/+/, '')}`;
}

async function main() {
  const { token, targets } = parseArgs(process.argv.slice(2));
  if (!token) {
    console.error('No token. Set GITHUB_TOKEN or pass --token <value>.');
    return 1;
  }

  let login;
  try {
    login = await fetchLogin(token);
    console.log(`[ok] /user -> ${login}`);
  } catch (e) {
    console.log(`[ng] /user -> ${e.message}`);
    return 1;
  }

  let failed = false;
  for (const t of targets) {
    const url = toUrl(t);
    const target = parseGitHubUrl(url);
    if (!target) {
      console.log(`[ng] ${url} -> not a PR/issue url (expected https://github.com/<owner>/<repo>/pull/<n> or /issues/<n>)`);
      failed = true;
      continue;
    }
    try {
      const data = await fetchIssue(token, target);
      const assignees = (data.assignees || []).map((a) => a.login);
      const kind = classifyPr(data, login);
      console.log(`[ok] ${url} -> ${target.kind} ${kind} (assignees: ${assignees.join(', ') || 'none'})`);
    } catch (e) {
      console.log(`[ng] ${url} -> ${e.message}`);
      if (e.status === 404) {
        console.log('     404 on a repo you can open in the browser means the token has no access to it:');
        console.log('     fine-grained token pending org approval, wrong resource owner, or repo not selected.');
      }
      failed = true;
    }
  }

  if (targets.length === 0) {
    console.log('No PR given; only /user was checked. Pass e.g. owner/repo/pull/123 to test repo access.');
  }
  return failed ? 1 : 0;
}

// process.exitCode instead of process.exit(): exiting while fetch handles are
// still closing trips a libuv assertion on Windows.
process.exitCode = await main();
