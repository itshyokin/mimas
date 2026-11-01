/**
 * Project menu for the hosted editor (changes kept in the browser): save the changes as a zip for the PC, open a
 * project or changes zip, or go back to the hosted project.
 */
import { changedFiles, changesZip, discardChanges, importZip } from './browserProject';
import { confirmModal, h, openModal, toast } from './dom';
import type { EditorStore } from './store';
import { save } from './io';
import { githubSection } from './githubPanel';

function download(blob: Blob, name: string): void {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

const stamp = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

export async function projectMenu(store: EditorStore): Promise<void> {
  const files = await changedFiles();
  const unsaved = store.dirty || store.dbDirty;
  const list = h('ul', { class: 'project-files' }, ...files.slice(0, 40).map((f) => h('li', {}, h('code', {}, `public/${f}`))),
    ...(files.length > 40 ? [h('li', {}, `…and ${files.length - 40} more`)] : []));
  let close = () => {};
  const saveZip = async () => {
    if (unsaved) await save(store);
    const now = await changedFiles();
    if (!now.length) { toast('Nothing has been changed on this device yet'); return; }
    download(await changesZip(), `hd2d-changes_${stamp()}.zip`);
    toast(`Saved ${now.length} changed file${now.length === 1 ? '' : 's'} as a zip`);
  };
  const openZip = () => {
    const input = h('input', { type: 'file', accept: '.zip,application/zip' });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const n = await importZip(f);
        if (!n) { toast('No project files in that zip (it needs public/data or public/assets inside)', 'error'); return; }
        toast(`Opened ${n} file${n === 1 ? '' : 's'}; reloading…`);
        close();
        setTimeout(() => location.reload(), 900);
      } catch (err) { toast(`Couldn’t open it: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
    });
    input.click();
  };
  const discard = () => confirmModal('Go back to the hosted project?', 'Every change kept on this device is forgotten (save them as a zip first if you want them). The editor reloads with the project as it is on GitHub.', 'Forget my changes', async () => {
    await discardChanges();
    store.dirty = false; store.dbDirty = false;
    location.reload();
  }, true);
  const body = h('div', { class: 'project-menu' },
    h('p', { class: 'modal-text' }, 'This editor keeps your changes in this browser, on this device, so they’re still here next time. Push them to GitHub from here (below), or save them as a zip to unzip into the project folder on your PC.'),
    githubSection(store, () => { close(); void projectMenu(store); }),
    h('div', { class: 'section-label' }, files.length ? `Kept on this device (${files.length})` : 'Nothing changed on this device yet'),
    files.length ? list : h('span'),
    unsaved ? h('p', { class: 'hint' }, 'The open map has unsaved changes: saving the zip saves them first.') : h('span'),
    h('div', { class: 'project-actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => void saveZip() }, 'Save changes as .zip'),
      h('button', { type: 'button', class: 'btn', onclick: openZip }, 'Open project .zip…'),
      h('button', { type: 'button', class: 'btn danger', onclick: discard, disabled: !files.length }, 'Forget my changes…')),
    h('p', { class: 'hint' }, 'Open project .zip takes a zip of your project folder (or of its public folder, or a changes zip from another device). Its maps, database and imported files replace the ones here.'));
  close = openModal('Project', body, [{ label: 'Close', primary: true }]);
}
