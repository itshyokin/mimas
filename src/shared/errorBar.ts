/**
 * Errors shown on screen (a tablet or phone has no developer tools to read them): a red bar at the bottom with what
 * went wrong, where, and Copy / Close buttons. The same message also goes to the console as usual.
 */
let bar: HTMLDivElement | null = null;
const seen = new Set<string>();

function show(text: string): void {
  if (seen.has(text) || seen.size > 20) return;
  seen.add(text);
  if (!bar) {
    bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;max-height:40vh;overflow:auto;padding:10px 12px;border-radius:10px;'
      + 'background:#3a0d12;border:1px solid #ff6b6b;color:#ffe3e3;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.6);white-space:pre-wrap;word-break:break-word';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;font-weight:700';
    head.textContent = 'Something went wrong (send this to Claude): ';
    const copy = document.createElement('button'), close = document.createElement('button');
    for (const b of [copy, close]) b.style.cssText = 'margin-left:auto;font:inherit;padding:2px 10px;border-radius:6px;border:1px solid #ff9b9b;background:#5a1820;color:#fff;cursor:pointer';
    copy.style.marginLeft = 'auto'; close.style.marginLeft = '0';
    copy.textContent = 'Copy'; close.textContent = 'Close';
    copy.onclick = () => void navigator.clipboard?.writeText(bar?.querySelector('.err-lines')?.textContent ?? '').then(() => { copy.textContent = 'Copied'; }).catch(() => {});
    close.onclick = () => { bar?.remove(); bar = null; };
    head.append(copy, close);
    const lines = document.createElement('div');
    lines.className = 'err-lines';
    bar.append(head, lines);
    document.body.append(bar);
  }
  const line = document.createElement('div');
  line.textContent = text;
  bar.querySelector('.err-lines')!.append(line);
}

/** Show uncaught errors and failed promises on screen. */
export function installErrorBar(where: string): void {
  (window as unknown as { __errorBar?: boolean }).__errorBar = true;
  addEventListener('error', (e) => {
    // A missing image or sound isn't worth a bar.
    if (!(e instanceof ErrorEvent)) return;
    show(`${where}: ${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})` : ''}${e.error?.stack ? `\n${String(e.error.stack).split('\n').slice(1, 4).join('\n')}` : ''}`);
  });
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    show(`${where}: ${r?.message ?? String(e.reason)}${r?.stack ? `\n${r.stack.split('\n').slice(1, 4).join('\n')}` : ''}`);
  });
  const ua = navigator.userAgent.match(/(Chrome|Firefox|Version)\/[\d.]+/)?.[0] ?? '';
  (window as unknown as { __browser?: string }).__browser = ua;
}
