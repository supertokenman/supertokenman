// The CDP driver of the agent browser: webContents.debugger, one client per tab. It reads the page with a
// FIXED script run in an isolated world (page scripts cannot see or change it), clicks and types with
// trusted Input events, takes screenshots and waits. The model never supplies code: the only strings that
// reach the page are element numbers, a typed text (inserted as text) and a CSS selector (passed as a
// JSON string literal to querySelector). No evaluate tool exists.
import type { WebContents } from 'electron'
import type { SnapNode, Snapshot } from '../../shared/browserindex.js'
import type { TextRun } from '../../shared/pagemd.js'

export type Collected = {
  snapshot: Snapshot
  runs: TextRun[]
  title: string
  /** visible text, capped, for the challenge classifier */
  text: string
  /** a secret field with a value is on the page: screenshots are refused */
  secretFilled: boolean
  /** `src` of the iframes, and markers of challenge widgets, for the challenge classifier */
  frames: string[]
  widgets: string[]
  viewport: { w: number; h: number }
}

// Runs in the isolated world. Plain JS in a string: the electron build has no DOM types.
const COLLECT = `(() => {
  const els = []; const ids = new Map(); const nodes = []; const runs = [];
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','HEAD','META','LINK','TITLE']);
  const vw = window.innerWidth, vh = window.innerHeight;
  const sq = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const SECRET = /pass|otp|cvv|cvc|card|secret|token|pin|2fa|code/i;
  const nameOf = (el) => {
    const a = el.getAttribute('aria-label'); if (a) return sq(a);
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\\s+/).map((i) => { const x = document.getElementById(i); return x ? x.textContent : ''; }).join(' '); if (sq(t)) return sq(t); }
    if (el.labels && el.labels.length) return sq(Array.from(el.labels).map((l) => l.textContent).join(' '));
    const tag = el.tagName;
    if (tag === 'INPUT') { const t = (el.type || '').toLowerCase(); if (t === 'submit' || t === 'button' || t === 'reset') return sq(el.value); return sq(el.getAttribute('alt') || el.placeholder || el.title || el.name); }
    if (tag === 'TEXTAREA' || tag === 'SELECT') return sq(el.placeholder || el.title || el.name);
    return sq(el.getAttribute('title') || el.innerText || el.textContent).slice(0, 160);
  };
  const walk = (el, parent, tags) => {
    if (SKIP.has(el.tagName)) return;
    const id = els.length; els.push(el); ids.set(el, id);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const hidden = cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || el.hidden === true;
    const inView = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? (el.type || 'text').toLowerCase() : undefined;
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    const secret = type === 'password' || /one-time-code|cc-number|cc-csc|cc-exp|current-password|new-password/.test(ac) || el.hasAttribute('data-secret') || ((tag === 'input' || tag === 'textarea') && type !== 'checkbox' && type !== 'radio' && type !== 'submit' && type !== 'button' && SECRET.test(el.name + ' ' + el.id + ' ' + (el.getAttribute('aria-label') || '')) && /^(text|tel|number|password|)$/.test(type || ''));
    const node = { id, parent, tag, box: inView && !hidden ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, hidden };
    const role = el.getAttribute('role'); if (role) node.role = role;
    if (type) node.inputType = type;
    if (secret) node.secret = true;
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (type === 'checkbox' || type === 'radio') node.value = el.checked ? 'checked' : 'unchecked';
      else if (tag === 'select') node.value = el.selectedOptions && el.selectedOptions[0] ? sq(el.selectedOptions[0].textContent) : '';
      else if (type !== 'submit' && type !== 'button') node.value = el.value;
    }
    if (node.box) {
      const interactive = /^(a|button|input|select|textarea|summary)$/.test(tag) || role;
      if (interactive || typeof el.onclick === 'function' || cs.cursor === 'pointer') { node.name = nameOf(el); if (!interactive) node.clickable = true; }
    }
    nodes.push(node);
    const block = cs.display.startsWith('inline') ? null : id;
    for (const ch of el.childNodes) {
      if (ch.nodeType === 1) walk(ch, id, tags.concat(tag));
      else if (ch.nodeType === 3 && ch.textContent.trim()) {
        const a = el.closest ? el.closest('a[href]') : null;
        const tr = el.closest ? el.closest('tr') : null;
        let b = el; while (b && getComputedStyle(b).display.startsWith('inline') && b.parentElement) b = b.parentElement;
        const run = { block: ids.has(b) ? ids.get(b) : id, tags: tags.concat(tag), text: ch.textContent, hidden: hidden || undefined, box: r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : null };
        if (a) run.href = a.href;
        if (tr && ids.has(tr)) run.row = ids.get(tr);
        runs.push(run);
      }
    }
  };
  walk(document.documentElement, null, []);
  for (const n of nodes) {
    if (!n.box) continue;
    const t = document.elementFromPoint(n.box.x + n.box.w / 2, n.box.y + n.box.h / 2);
    n.topAt = t && ids.has(t) ? ids.get(t) : null;
  }
  globalThis.__stmEls = els;
  const secretFilled = nodes.some((n) => n.secret && n.value && n.value.length > 0);
  for (const n of nodes) if (n.secret) delete n.value;
  const frames = Array.from(document.querySelectorAll('iframe')).map((f) => f.src || f.getAttribute('src') || '').filter(Boolean).slice(0, 30);
  const widgets = [];
  for (const c of ['g-recaptcha', 'h-captcha', 'cf-turnstile', 'cf-challenge', 'px-captcha']) if (document.getElementsByClassName(c).length) widgets.push(c);
  for (const i of ['challenge-form', 'challenge-stage']) if (document.getElementById(i)) widgets.push(i);
  return JSON.stringify({ snapshot: { url: location.href, nodes }, runs, title: document.title, text: sq(document.body ? document.body.innerText : '').slice(0, 4000), secretFilled, frames, widgets, viewport: { w: vw, h: vh } });
})()`

const el = (id: number) => `(globalThis.__stmEls && globalThis.__stmEls[${Number(id)}])`

export type Point = { x: number; y: number }

export class Cdp {
  private ctx = 0
  private attached = false
  private detachNote = ''
  /** called when the page asked for a file chooser (never opened) */
  onFileChooser: () => void = () => undefined
  constructor(private wc: WebContents) {}

  private async ensure(): Promise<void> {
    if (this.wc.isDestroyed()) throw new Error('the tab is closed')
    if (this.attached && this.wc.debugger.isAttached()) return
    this.attached = false
    try {
      this.wc.debugger.attach('1.3')
    } catch (e) {
      // another client (the person's DevTools) holds it
      if (!this.wc.debugger.isAttached()) throw new Error(`cannot attach to the page: ${(e as Error).message}`)
    }
    this.attached = true
    this.ctx = 0
    this.wc.debugger.removeAllListeners('detach')
    this.wc.debugger.on('detach', (_e, reason) => {
      this.attached = false
      this.ctx = 0
      this.detachNote = String(reason)
    })
    this.wc.debugger.on('message', (_e, method) => {
      if (method === 'Page.fileChooserOpened') this.onFileChooser()
    })
    await this.wc.debugger.sendCommand('Page.enable')
    await this.wc.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => undefined)
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    await this.ensure()
    return (await this.wc.debugger.sendCommand(method, params)) as T
  }

  /** The page changed document: the isolated world is gone. */
  reset(): void {
    this.ctx = 0
  }

  private async world(): Promise<number> {
    if (this.ctx) return this.ctx
    const tree = await this.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree')
    const w = await this.send<{ executionContextId: number }>('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'stm' })
    return (this.ctx = w.executionContextId)
  }

  private async run<T>(expression: string): Promise<T> {
    const contextId = await this.world()
    const r = await this.send<{ result: { value?: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.evaluate', { expression, contextId, returnByValue: true })
    if (r.exceptionDetails) {
      this.ctx = 0
      throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text)
    }
    return r.result.value as T
  }

  async collect(): Promise<Collected> {
    const json = await this.run<string>(COLLECT)
    return JSON.parse(json) as Collected
  }

  /** Scrolls the element into view and returns its centre, or null when it is gone or covered. */
  async center(id: number): Promise<Point | null> {
    return this.run<Point | null>(`(() => { const e = ${el(id)}; if (!e || !e.isConnected) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return null; const x = r.x + r.width / 2, y = r.y + r.height / 2; const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t) || t.contains(e)) ? { x, y } : null })()`)
  }

  async click(p: Point): Promise<void> {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  }

  /** Focuses a field and selects what is in it, so the typed text replaces it. */
  async focus(id: number): Promise<boolean> {
    return this.run<boolean>(`(() => { const e = ${el(id)}; if (!e || !e.isConnected) return false; e.focus(); if (e.select) e.select(); return document.activeElement === e })()`)
  }

  async insertText(text: string): Promise<void> {
    if (text === '') await this.key('Backspace', 8)
    else await this.send('Input.insertText', { text })
  }

  async key(key: string, code: number): Promise<void> {
    const base = { key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base, ...(key === 'Enter' ? { text: '\r' } : {}) })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  }

  /** Chooses an option of a select by its value or its visible text. */
  async select(id: number, value: string): Promise<boolean> {
    return this.run<boolean>(`(() => { const e = ${el(id)}; if (!e || e.tagName !== 'SELECT') return false; const v = ${JSON.stringify(value)}; const o = Array.from(e.options).find((x) => x.value === v) || Array.from(e.options).find((x) => x.textContent.trim() === v); if (!o) return false; e.value = o.value; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  }

  async scroll(dir: 'up' | 'down', amount: 'page' | 'half', vh: number): Promise<void> {
    const dy = Math.round(vh * (amount === 'page' ? 0.9 : 0.45)) * (dir === 'down' ? 1 : -1)
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 10, y: 10, deltaX: 0, deltaY: dy })
  }

  /** True when the selector matches. The selector is a JSON string literal for querySelector, never code. */
  async has(selector: string): Promise<boolean> {
    return this.run<boolean>(`(() => { try { return document.querySelector(${JSON.stringify(selector)}) !== null } catch { return false } })()`)
  }

  /** The remote object of an element of the last list (isolated world). */
  private async object(id: number): Promise<string | null> {
    const r = await this.send<{ result: { objectId?: string; subtype?: string } }>('Runtime.evaluate', { expression: el(id), contextId: await this.world(), returnByValue: false })
    return r.result.subtype === 'node' ? (r.result.objectId ?? null) : null
  }

  /** Marks the element the agent acts on with the browser's own overlay (tint over the box). Never throws. */
  async highlight(id: number): Promise<void> {
    try {
      const objectId = await this.object(id)
      if (!objectId) return
      await this.send('DOM.enable')
      await this.send('Overlay.enable')
      const c = { r: 217, g: 119, b: 87 }
      await this.send('Overlay.highlightNode', { objectId, highlightConfig: { showInfo: false, contentColor: { ...c, a: 0.22 }, paddingColor: { ...c, a: 0.12 }, borderColor: { ...c, a: 0.9 } } })
    } catch {
      // cosmetic only
    }
  }

  async unhighlight(): Promise<void> {
    try {
      await this.send('Overlay.hideHighlight')
    } catch {
      // gone with the page
    }
  }

  /** Puts files into an `<input type=file>`. The paths were approved by the person and checked to be inside the project. */
  async upload(id: number, files: string[]): Promise<boolean> {
    const ok = await this.run<boolean>(`(() => { const e = ${el(id)}; return Boolean(e && e.tagName === 'INPUT' && e.type === 'file' && e.isConnected) })()`)
    if (!ok) return false
    const objectId = await this.object(id)
    if (!objectId) return false
    await this.send('DOM.setFileInputFiles', { files, objectId })
    return true
  }

  async screenshot(): Promise<Buffer> {
    const r = await this.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    return Buffer.from(r.data, 'base64')
  }

  get note(): string {
    return this.detachNote
  }

  dispose(): void {
    try {
      if (!this.wc.isDestroyed() && this.wc.debugger.isAttached()) this.wc.debugger.detach()
    } catch {
      // already gone
    }
    this.attached = false
  }
}

export type { SnapNode }
