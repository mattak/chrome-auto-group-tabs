// Thin GitHub REST client used by the service worker and the options page.

const API = 'https://api.github.com';

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function request(token, path) {
  const res = await fetch(`${API}${path}`, { headers: headers(token) });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      if (body && body.message) detail = `: ${body.message}`;
    } catch {
      // ignore non-JSON error bodies
    }
    const err = new Error(`GitHub API ${res.status} for ${path}${detail}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Resolve the login of the token owner. */
export async function fetchLogin(token) {
  const user = await request(token, '/user');
  return user.login;
}

/**
 * Fetch an issue or a pull request. The issues endpoint serves both and
 * returns `assignees[]` for either, which is all we read.
 */
export async function fetchIssue(token, { owner, repo, number }) {
  return request(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`,
  );
}
