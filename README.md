# GitHub PR Assignee Tab Groups

Chrome extension (Manifest V3) that puts GitHub pull request tabs into one of two
tab groups depending on whether the PR is assigned to you:

- `pr-mine` – PRs where you are in the assignee list
- `pr-others` – every other PR

It only touches `https://github.com/<owner>/<repo>/pull/<n>` tabs and leaves all
other tabs alone, so it can run next to a general URL-rule grouper such as
[Auto-Group Tabs](https://github.com/loilo/auto-group-tabs).

## How it works

1. `chrome.tabs.onUpdated` fires with a new URL.
2. If the URL is a PR page, the service worker calls
   `GET /repos/{owner}/{repo}/pulls/{n}` with your personal access token and
   checks `assignees[].login` against your login (`GET /user`, cached).
3. The tab is moved into the matching group in its own window. The group is
   created on first use.
4. When a tab in `pr-mine` / `pr-others` navigates away from a PR page it is
   ungrouped, so other groupers can pick it up again. Tabs in any other group
   are never touched.

One API call per PR navigation. Authenticated rate limit is 5,000 requests per
hour, which is far above normal browsing.

## Install (unpacked)

1. Clone this repository.
2. Open `chrome://extensions`, enable **Developer mode**, click
   **Load unpacked** and select the repository folder.
3. Open the extension's **Options** page.
4. Paste a personal access token and click **Save**.
   - Classic token: `repo` scope (needed for private repositories).
   - Fine-grained token: **Pull requests: Read-only** on the repositories you
     care about. Add **Metadata: Read-only** (GitHub adds it automatically).
5. Click **Test token** to confirm the login it resolves to, then
   **Re-scan open tabs**.

The token must belong to the account that actually gets assigned to PRs. If
that is the account `gh` is logged in as, `gh auth token` prints a token with
`repo` scope you can paste directly. A token from a different account produces
no error; every PR simply ends up in `pr-others`.

For fine-grained tokens on organisation repositories the organisation must be
the resource owner and may have to approve the token. A classic `repo` token
avoids that step.

The token is stored in `chrome.storage.local` for this browser profile only and
is sent to `https://api.github.com` and nowhere else.

## Using it together with Auto-Group Tabs

Auto-Group Tabs re-assigns a tab on every URL change, and a bare `github.com`
rule matches PR pages too. Both extensions will then act on the same navigation
and the result depends on timing. To avoid that, make the Auto-Group Tabs rule
for GitHub skip PR pages. Replace `github.com` with this regex pattern
(Auto-Group Tabs treats a pattern that starts with `/` as a regular expression):

```
/^https?:\/\/github\.com(?!\/[^/]+\/[^/]+\/pull\/\d+)/
```

This still matches `github.com/<owner>/<repo>`, `/pulls`, `/issues/...` and so
on, but not `/pull/<n>` or anything under it.

## Development

```
node --test
```

The pure logic (URL parsing, assignee check, settings normalisation) lives in
`lib.js` and is covered by `test/lib.test.js`. The Chrome-specific parts are in
`background.js`; there is no automated browser test.

## Limitations

- Desktop Chrome only. The tab groups API is not available on Android.
- Groups are per window. Opening a PR in another window creates a second
  `pr-mine` or `pr-others` group there.
- Only `assignees` is consulted. Requested reviewers are treated as "others".
