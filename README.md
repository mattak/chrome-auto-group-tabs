# GitHub PR Assignee Tab Groups

Chrome extension (Manifest V3) that sorts tabs into tab groups two ways:

1. **Assignee groups.** GitHub pull request and issue tabs go into one of four
   groups depending on whether the PR or issue is assigned to you:
   `pr-mine`, `pr-others`, `issue-mine`, `issue-others`. Each can be renamed,
   recolored or switched off.
2. **URL rules.** Any other tab is matched against an ordered list of URL
   patterns, first match wins. The pattern syntax is the same as
   [Auto-Group Tabs](https://github.com/loilo/auto-group-tabs), so rules can
   be copied over as they are.

Assignee classification always runs before URL rules, so a broad `github.com`
rule never swallows PR or issue tabs.

## How it works

1. `chrome.tabs.onUpdated` fires with a new URL.
2. If the URL is `https://github.com/<owner>/<repo>/pull/<n>` or
   `/issues/<n>`, the service worker calls `GET /repos/{owner}/{repo}/issues/{n}`
   with your token (the issues endpoint serves PRs too) and checks
   `assignees[].login` against your login (`GET /user`, cached). The result is
   cached for five minutes per PR/issue.
3. Otherwise the URL is tested against the rules, top to bottom.
4. The tab is moved into the matching group in its own window. The group is
   created on first use.
5. A tab that leaves a PR/issue page and matches no rule is removed from its
   assignee group. Tabs in URL-rule groups stay where they are when the URL
   stops matching (same default as Auto-Group Tabs). Groups the extension did
   not create are never touched.

## Install (unpacked)

1. Clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked** and select the repository folder.
3. Open the extension's **Options** page.
4. Paste a token and click **Save**.
   - The token from `gh auth token` works (OAuth token with `repo` scope).
   - Classic PAT: `repo` scope.
   - Fine-grained PAT: **Pull requests: Read-only** and **Issues: Read-only**
     on the repositories you care about, with the organisation as resource
     owner. Organisations may require approval before such a token works.
5. Click **Test token** to confirm the login it resolves to, then
   **Re-scan open tabs**.

The token must belong to the account that actually gets assigned. A token from
a different account produces no error; everything simply ends up in
`*-others`.

The token is stored in `chrome.storage.local` for this browser profile only and
is sent to `https://api.github.com` and nowhere else.

## URL rule syntax

| Pattern | Matches |
| --- | --- |
| `example.com` | `http(s)://example.com` with any path or port |
| `*.example.com` | same, plus any subdomain |
| `https://example.com/docs/*` | path glob; `*` also crosses `/` |
| `*://example.com` | http or https |
| `localhost:3000` | that port only |
| `chrome://*`, `file:///foo/*` | other schemes followed by a glob |
| `*` | everything |
| `/^https:\/\/x\.com\/(a|b)\//i` | JavaScript regex with optional flags |

Rules can be reordered, exported and imported as JSON from the options page:

```json
[
  { "pattern": "https://drive.google.com/*", "title": "daily", "color": "blue" },
  { "pattern": "github.com", "title": "gh-work", "color": "grey" },
  { "pattern": "https://claude.ai/*", "title": "claude", "color": "yellow" }
]
```

## Checking a token from the command line

`tools/check-token.mjs` performs the same requests the extension makes:

```
GITHUB_TOKEN=github_pat_... node tools/check-token.mjs octo-org/hello-world/pull/1957 octo-org/hello-world/issues/1966
```

It prints the login the token resolves to and, for each PR or issue given,
whether it would land in `mine` or `others`. A 404 on a repository you can open
in the browser means the token cannot see that repository.

## Development

```
node --test
```

Pure logic lives in `lib.js` (URL parsing, assignee check, settings) and
`matcher.js` (pattern compiler, tests ported from Auto-Group Tabs). The
Chrome-specific parts are in `background.js`; there is no automated browser
test.

## Limitations

- Desktop Chrome only. The tab groups API is not available on Android.
- Groups are per window. Opening a PR in another window creates a second group
  there.
- Only `assignees` is consulted. Requested reviewers count as "others".

## License

MIT
