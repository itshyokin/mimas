/**
 * Project → GitHub (the hosted editor): connect with a token, Pull what was pushed from elsewhere, Push this
 * device's changes as a commit. See githubSync.ts.
 */
import { field, h, openModal, toast } from './dom';
import { save } from './io';
import type { EditorStore } from './store';
import { type Conflict, type GitHubLink, GitHubError, guessRepo, pendingChanges, pull, push, saveLink, savedLink, testLink } from './githubSync';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** A small "working…" window that shows what's happening; returns its setter and closer. */
function busy(title: string): { say: (t: string) => void; done: () => void } {
  const line = h('p', { class: 'modal-text gh-busy' }, 'Working…');
  const close = openModal(title, line, [], undefined, { beforeDismiss: () => false });
  return { say: (t) => { line.textContent = t; }, done: close };
}

const why = (e: unknown) => (e instanceof GitHubError ? e.message : e instanceof Error ? e.message : String(e));

/** Connect: the repository and a token (with how to make one). */
export function connectGitHub(after: () => void): void {
  const was = savedLink(), guess = guessRepo();
  const owner = h('input', { type: 'text', value: was?.owner ?? guess.owner, placeholder: 'itshyokin', autocomplete: 'off', spellcheck: false });
  const repo = h('input', { type: 'text', value: was?.repo ?? guess.repo, placeholder: 'mimas', autocomplete: 'off', spellcheck: false });
  const branch = h('input', { type: 'text', value: was?.branch ?? 'main', autocomplete: 'off', spellcheck: false });
  const token = h('input', { type: 'password', value: '', placeholder: was ? '(keep the one saved)' : 'github_pat_…', autocomplete: 'off', spellcheck: false });
  const msg = h('p', { class: 'hint gh-msg' });
  const body = h('div', { class: 'gh-connect' },
    h('p', { class: 'modal-text' }, 'Push and Pull from this device need a GitHub token: a password just for this repository, kept only in this browser. To make one (once):'),
    h('ol', { class: 'gh-steps' },
      h('li', {}, 'Open ', h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener' }, 'GitHub → Settings → Fine-grained tokens → Generate new token'), ' (sign in if asked).'),
      h('li', {}, 'Name it (say “Tablet editor”) and pick how long it lasts.'),
      h('li', {}, 'Repository access: ', h('b', {}, 'Only select repositories'), ' → this project’s repository.'),
      h('li', {}, 'Permissions → Repository permissions → ', h('b', {}, 'Contents: Read and write'), ' (Metadata: Read-only is added by itself).'),
      h('li', {}, 'Generate token, copy it, and paste it below.')),
    h('div', { class: 'field-row' }, field('Owner', owner), field('Repository', repo), field('Branch', branch)),
    field('Token', token, 'Anyone with this token can change the repository, so keep it to yourself. Lost the tablet? Delete the token on GitHub and it stops working at once.'),
    msg);
  openModal('Connect to GitHub', body, [
    { label: 'Cancel' },
    {
      label: 'Connect', primary: true, onClick: () => {
        const l: GitHubLink = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', token: token.value.trim() || was?.token || '' };
        if (!l.owner || !l.repo || !l.token) { msg.textContent = 'Fill in the owner, the repository and the token.'; return false; }
        msg.textContent = 'Checking…';
        testLink(l).then((name) => {
          saveLink(l);
          toast(`Connected to ${name}`);
          document.querySelector('.gh-connect')?.closest('.overlay')?.remove();
          after();
        }).catch((e) => { msg.textContent = why(e); });
        return false;
      },
    },
  ]);
}

/** Same file changed here and on GitHub: say which, and let the player choose. */
function conflictModal(c: Conflict, what: 'push' | 'pull', choose: (k: 'mine' | 'theirs' | 'pull') => void): void {
  const list = h('ul', { class: 'project-files' }, ...c.files.slice(0, 30).map((f) => h('li', {}, h('code', {}, `public/${f}`))));
  const text = what === 'push'
    ? 'GitHub has newer versions of these than the ones this device’s edits started from (changed from the PC, or this device kept an old copy). Pull first and choose for each, or push this device’s versions over them (GitHub’s newer changes to these files would be lost).'
    : 'These were changed both here and on GitHub. Keep this device’s versions (they’ll go up with the next Push) or take GitHub’s (this device’s changes to them are dropped).';
  openModal('Changed in both places', h('div', {}, h('p', { class: 'modal-text' }, text), list), what === 'push'
    ? [{ label: 'Cancel' }, { label: 'Pull first', primary: true, onClick: () => choose('pull') }, { label: 'Push mine over them', danger: true, onClick: () => choose('mine') }]
    : [{ label: 'Cancel' }, { label: 'Keep mine', primary: true, onClick: () => choose('mine') }, { label: 'Take GitHub’s', danger: true, onClick: () => choose('theirs') }]);
}

export async function doPull(store: EditorStore, resolve?: 'mine' | 'theirs'): Promise<void> {
  const l = savedLink();
  if (!l) { connectGitHub(() => void doPull(store)); return; }
  if (store.dirty || store.dbDirty) await save(store);
  const b = busy('Pull from GitHub');
  try {
    const r = await pull(l, resolve, b.say);
    b.done();
    if (r.kind === 'conflict') { conflictModal(r, 'pull', (k) => void doPull(store, k === 'theirs' ? 'theirs' : 'mine')); return; }
    if (!r.files) { toast('Up to date with GitHub'); return; }
    toast(`Pulled ${r.files} file${r.files === 1 ? '' : 's'} from GitHub; reloading…`);
    setTimeout(() => location.reload(), 900);
  } catch (e) { b.done(); toast(why(e), 'error'); }
}

export async function doPush(store: EditorStore): Promise<void> {
  const l = savedLink();
  if (!l) { connectGitHub(() => void doPush(store)); return; }
  if (store.dirty || store.dbDirty) await save(store);
  let files: string[] = [];
  const check = busy('Push to GitHub');
  try { files = (await pendingChanges(l)).map((p) => p.path); } catch (e) { check.done(); toast(why(e), 'error'); return; }
  check.done();
  if (!files.length) { toast('Nothing to push: GitHub already has everything from this device'); return; }
  const d = new Date();
  const message = h('input', { type: 'text', value: `Edits from the tablet editor (${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})` });
  const body = h('div', {},
    h('p', { class: 'modal-text' }, `${files.length} changed file${files.length === 1 ? '' : 's'} will go to ${l.owner}/${l.repo} (${l.branch}) as one commit. The online editor and game update a minute or two later; GitHub Desktop on the PC gets them with Fetch / Pull.`),
    h('ul', { class: 'project-files' }, ...files.slice(0, 30).map((f) => h('li', {}, h('code', {}, `public/${f}`))), ...(files.length > 30 ? [h('li', {}, `…and ${files.length - 30} more`)] : [])),
    field('What changed (the commit message)', message));
  const send = async (resolve?: 'mine') => {
    const b = busy('Push to GitHub');
    try {
      const r = await push(l, message.value.trim() || 'Edits from the tablet editor', resolve, b.say);
      b.done();
      if (r.kind === 'conflict') { conflictModal(r, 'push', (k) => { if (k === 'pull') void doPull(store); else void send('mine'); }); return; }
      if (r.kind === 'nothing') { toast('Nothing to push: GitHub already has everything from this device'); return; }
      toast(`Pushed ${r.files} file${r.files === 1 ? '' : 's'} to GitHub`);
    } catch (e) { b.done(); toast(why(e), 'error'); }
  };
  openModal('Push to GitHub', body, [{ label: 'Cancel' }, { label: 'Push', primary: true, onClick: () => { void send(); } }]);
}

/** The GitHub part of the Project menu. */
export function githubSection(store: EditorStore, refresh: () => void): HTMLElement {
  const l = savedLink();
  if (!l) return h('div', { class: 'gh-section' },
    h('div', { class: 'section-label' }, 'GitHub'),
    h('p', { class: 'hint' }, 'Push this device’s changes straight to the project on GitHub (and Pull what was pushed from the PC), no zip or GitHub Desktop needed.'),
    h('div', { class: 'project-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => connectGitHub(refresh) }, 'Connect to GitHub…')));
  return h('div', { class: 'gh-section' },
    h('div', { class: 'section-label' }, `GitHub: ${l.owner}/${l.repo} (${l.branch})`),
    h('div', { class: 'project-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => void doPull(store) }, '⤓ Pull from GitHub'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => void doPush(store) }, '⤒ Push to GitHub…'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => connectGitHub(refresh) }, 'Change…'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { saveLink(null); toast('Disconnected (the token is forgotten on this device)'); refresh(); } }, 'Disconnect')),
    h('p', { class: 'hint' }, 'Pull before you start (to get what you pushed from the PC), Push when you’re done. If a file was changed in both places, you choose which to keep.'));
}
