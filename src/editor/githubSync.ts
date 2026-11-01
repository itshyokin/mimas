/**
 * Push to GitHub and Pull from it, straight from the hosted editor (a tablet or phone has no GitHub Desktop).
 *
 * The editor keeps changed files in the browser over the hosted project (browserProject.ts). Here they go to the
 * repository through GitHub's web API with a personal access token kept in this browser: Push makes one commit with
 * every file that differs from the repository's, on top of whatever is there now (work pushed from the PC stays);
 * Pull brings in what was pushed from elsewhere. If the same file was changed both here and on GitHub since the last
 * Pull or Push, nothing is overwritten until the player picks which to keep.
 *
 * The browser's files are laid out like public/ (data/…, assets/…); in the repository they're under public/.
 */
import { blobSha, changedFiles, readBased, readLocal, writeBased, writeLocal } from './browserProject';

export interface GitHubLink { owner: string; repo: string; branch: string; token: string }

const LINK_KEY = 'hd2d.github';
const API = 'https://api.github.com';
/** The last commit this device pulled or pushed (what its changes are "on top of"). */
const BASE_FILE = '.sync/base.json';

/* ------------------------------------------------------------------ the connection */

/** Owner and repository guessed from the site's address (owner.github.io/repo/editor.html). */
export function guessRepo(): { owner: string; repo: string } {
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  const first = location.pathname.split('/').filter(Boolean)[0];
  return { owner: m?.[1] ?? '', repo: m && first && !first.includes('.') ? first : '' };
}

export function savedLink(): GitHubLink | null {
  try {
    const v = JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null') as GitHubLink | null;
    return v?.token && v.owner && v.repo ? { ...v, branch: v.branch || 'main' } : null;
  } catch { return null; }
}
export function saveLink(l: GitHubLink | null): void {
  try { if (l) localStorage.setItem(LINK_KEY, JSON.stringify(l)); else localStorage.removeItem(LINK_KEY); } catch { /* private window */ }
}

export class GitHubError extends Error { constructor(message: string, readonly status = 0) { super(message); } }

async function api<T>(l: GitHubLink, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/repos/${l.owner}/${l.repo}${path}`, {
      ...init, cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${l.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch { throw new GitHubError('Couldn’t reach GitHub. Check the internet connection and try again.'); }
  if (!res.ok) {
    let msg = '';
    try { msg = ((await res.json()) as { message?: string }).message ?? ''; } catch { /* no body */ }
    if (res.status === 401) throw new GitHubError('GitHub didn’t accept the token (it may have expired or been deleted). Connect again with a new one.', 401);
    if (res.status === 403) throw new GitHubError(`The token can’t do that: give it “Contents: Read and write” for this repository. ${msg}`.trim(), 403);
    if (res.status === 404) throw new GitHubError(`GitHub couldn’t find ${l.owner}/${l.repo} (branch ${l.branch}) with this token. Check the names, and that the token has access to the repository.`, 404);
    throw new GitHubError(`GitHub said: ${msg || `error ${res.status}`}`, res.status);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

/** Check a connection: the repository is there and the token can write to it. Returns its full name. */
export async function testLink(l: GitHubLink): Promise<string> {
  const r = await api<{ full_name: string; permissions?: { push?: boolean } }>(l, '');
  if (r.permissions && !r.permissions.push) throw new GitHubError('This token can read the repository but not push to it: give it “Contents: Read and write”.');
  await headSha(l);
  return r.full_name;
}

/* ------------------------------------------------------------------ git bits */

const headSha = async (l: GitHubLink): Promise<string> => (await api<{ object: { sha: string } }>(l, `/git/ref/heads/${encodeURIComponent(l.branch)}`)).object.sha;

/** Every file in a commit, path → blob sha. */
async function treeOf(l: GitHubLink, commit: string): Promise<Map<string, string>> {
  const c = await api<{ tree: { sha: string } }>(l, `/git/commits/${commit}`);
  const t = await api<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(l, `/git/trees/${c.tree.sha}?recursive=1`);
  return new Map(t.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
}

function base64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}
function unbase64(b: string): Uint8Array {
  const s = atob(b.replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const repoPath = (local: string) => `public/${local}`;
const localPath = (repo: string) => (repo.startsWith('public/data/') || repo.startsWith('public/assets/') ? repo.slice('public/'.length) : null);

/** The commit this device's changes sit on: the last Pull or Push, else the one the site was built from. */
async function baseOf(): Promise<string | null> {
  const f = await readLocal(BASE_FILE);
  if (f) { try { return (JSON.parse(await f.text()) as { commit?: string }).commit ?? null; } catch { /* fall through */ } }
  try {
    const res = await fetch('data/build.json', { cache: 'no-store' });
    if (res.ok) return ((await res.json()) as { commit?: string }).commit ?? null;
  } catch { /* not built with it */ }
  return null;
}
const setBase = (commit: string) => writeLocal(BASE_FILE, JSON.stringify({ commit, at: new Date().toISOString() }));

/** Files (repository paths) changed on GitHub between two commits; null if it can't tell. */
async function changedOnGitHub(l: GitHubLink, from: string, to: string): Promise<Set<string> | null> {
  if (from === to) return new Set();
  try {
    const c = await api<{ files?: { filename: string; previous_filename?: string }[] }>(l, `/compare/${from}...${to}`);
    return new Set((c.files ?? []).flatMap((f) => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]));
  } catch { return null; }
}

/**
 * This device's changed files that GitHub has moved on from since the edit started: an old copy, or a file changed in
 * both places. `based` is the version each edit started from (none: kept from before that was noted).
 */
function outdated(mine: Pending[], tree: Map<string, string>, based: Record<string, string>): string[] {
  return mine.filter((m) => {
    const was = based[m.path], now = tree.get(repoPath(m.path));
    if (was === undefined) return true;
    return was === 'new' ? now !== undefined : was !== now;
  }).map((m) => m.path);
}

/* ------------------------------------------------------------------ what's waiting */

export interface Pending { path: string; data: Uint8Array; sha: string }

/** This device's files that differ from the repository's latest (what Push would send). */
export async function pendingChanges(l: GitHubLink, tree?: Map<string, string>): Promise<Pending[]> {
  const t = tree ?? await treeOf(l, await headSha(l));
  const out: Pending[] = [];
  for (const p of await changedFiles()) {
    const f = await readLocal(p);
    if (!f) continue;
    const data = new Uint8Array(await f.arrayBuffer()), sha = await blobSha(data);
    if (t.get(repoPath(p)) !== sha) out.push({ path: p, data, sha });
  }
  return out;
}

/* ------------------------------------------------------------------ Push */

export interface PushResult { kind: 'pushed'; commit: string; files: number; url: string }
export interface Conflict { kind: 'conflict'; files: string[] }
export interface NothingToDo { kind: 'nothing' }

/**
 * One commit with every changed file, on top of the branch as it is now. `resolve`: for files also changed on GitHub,
 * 'mine' sends this device's anyway; without it, such files stop the push (a Conflict).
 */
export async function push(l: GitHubLink, message: string, resolve?: 'mine', progress?: (text: string) => void): Promise<PushResult | Conflict | NothingToDo> {
  for (let attempt = 0; attempt < 3; attempt++) {
    progress?.('Checking GitHub…');
    const head = await headSha(l), tree = await treeOf(l, head);
    const mine = await pendingChanges(l, tree);
    if (!mine.length) { await setBase(head); return { kind: 'nothing' }; }
    // GitHub's copy moved on since this device's edit started (changed from the PC, or this is an old copy): ask.
    const based = await readBased();
    if (resolve !== 'mine') {
      const both = outdated(mine, tree, based);
      if (both.length) return { kind: 'conflict', files: both };
    }
    let n = 0;
    const entries: { path: string; mode: string; type: string; sha: string }[] = [];
    for (const m of mine) {
      progress?.(`Sending ${++n} of ${mine.length}: ${m.path.split('/').pop()}`);
      const b = await api<{ sha: string }>(l, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: base64(m.data), encoding: 'base64' }) });
      entries.push({ path: repoPath(m.path), mode: '100644', type: 'blob', sha: b.sha });
    }
    progress?.('Making the commit…');
    const c = await api<{ tree: { sha: string } }>(l, `/git/commits/${head}`);
    const t = await api<{ sha: string }>(l, '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: c.tree.sha, tree: entries }) });
    const commit = await api<{ sha: string; html_url: string }>(l, '/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [head] }) });
    try {
      await api(l, `/git/refs/heads/${encodeURIComponent(l.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
    } catch (e) {
      // Someone pushed in the meantime: start again on top of theirs.
      if (e instanceof GitHubError && e.status === 422) continue;
      throw e;
    }
    await setBase(commit.sha);
    // These are now GitHub's versions too: later edits start from them.
    for (const m of mine) based[m.path] = m.sha;
    await writeBased(based);
    return { kind: 'pushed', commit: commit.sha, files: mine.length, url: commit.html_url };
  }
  throw new GitHubError('GitHub kept changing while pushing (someone else is pushing too). Try again in a moment.');
}

/* ------------------------------------------------------------------ Pull */

export interface PullResult { kind: 'pulled'; files: number }

/**
 * Bring in what changed on GitHub since this device last pulled or pushed (maps, database, imported files), so the
 * editor shows it at once (the site takes a minute or two to rebuild). A file also changed here stops the pull
 * (a Conflict) unless `resolve` says which to keep.
 */
export async function pull(l: GitHubLink, resolve?: 'mine' | 'theirs', progress?: (text: string) => void): Promise<PullResult | Conflict> {
  progress?.('Checking GitHub…');
  const head = await headSha(l), tree = await treeOf(l, head);
  const base = await baseOf();
  let theirs = base ? await changedOnGitHub(l, base, head) : null;
  // Without a starting point: everything in the project that differs from GitHub's counts as theirs.
  if (!theirs) theirs = new Set([...tree.keys()].filter((p) => localPath(p)));
  const pending = await pendingChanges(l, tree), mine = new Set(pending.map((m) => m.path)), based = await readBased();
  const wanted = [...theirs].map((p) => ({ repo: p, local: localPath(p) })).filter((x): x is { repo: string; local: string } => !!x.local && tree.has(x.repo));
  // This device's old copies (GitHub moved on since they were taken) count as changed in both places too.
  for (const p of outdated(pending, tree, based)) if (tree.has(repoPath(p)) && !wanted.some((x) => x.local === p)) wanted.push({ repo: repoPath(p), local: p });
  const both = wanted.filter((x) => mine.has(x.local)).map((x) => x.local);
  // Without a starting point every file would look changed: only files this device kept count as both.
  if (both.length && !resolve) return { kind: 'conflict', files: both };
  let n = 0;
  for (const x of wanted) {
    // Keeping this device's: it now counts as an edit of GitHub's latest (the next Push sends it without asking).
    if (mine.has(x.local) && resolve === 'mine') { based[x.local] = tree.get(x.repo)!; continue; }
    based[x.local] = tree.get(x.repo)!;
    // Only files this device already keeps need writing when there was no starting point (the rest come from the site).
    if (!base && !(await readLocal(x.local))) continue;
    progress?.(`Getting ${++n}: ${x.local.split('/').pop()}`);
    const b = await api<{ content: string; encoding: string }>(l, `/git/blobs/${tree.get(x.repo)}`);
    await writeLocal(x.local, b.encoding === 'base64' ? unbase64(b.content) : new TextEncoder().encode(b.content));
  }
  await setBase(head);
  await writeBased(based);
  return { kind: 'pulled', files: n };
}
