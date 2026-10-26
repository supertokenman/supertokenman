// Phone companion: a small page the app serves on the local network while you turn it on. Pairing is a
// six-digit code shown on the computer, good for two minutes and five tries; it buys a long token that
// lives only in the app's memory. These are the parts with no server: pairing, the view, the page.

export type Pairing = { code: string | null; until: number; tries: number; tokens: Map<string, { name: string; at: number }> }
export const PAIR_MS = 2 * 60_000
export const MAX_TRIES = 5

export const newPairing = (): Pairing => ({ code: null, until: 0, tries: 0, tokens: new Map() })

/** A fresh code; the old one stops working. */
export function openPairing(p: Pairing, now: number, rand: () => number): string {
  p.code = String(Math.floor(rand() * 1_000_000)).padStart(6, '0')
  p.until = now + PAIR_MS
  p.tries = 0
  return p.code
}

/** Constant-time compare of two short strings. */
export function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

/** A code typed on the phone. Five wrong tries or two minutes close pairing until a new code. */
export function tryPair(p: Pairing, code: string, now: number, token: string, name: string): { ok: true; token: string } | { ok: false; why: string } {
  if (!p.code || now > p.until) return { ok: false, why: 'No pairing open. Show a new code on the computer.' }
  if (p.tries >= MAX_TRIES) return { ok: false, why: 'Too many tries. Show a new code on the computer.' }
  if (!same(String(code).trim(), p.code)) {
    p.tries++
    if (p.tries >= MAX_TRIES) p.code = null
    return { ok: false, why: 'Wrong code.' }
  }
  p.code = null
  p.tokens.set(token, { name: name.slice(0, 60) || 'Phone', at: now })
  return { ok: true, token }
}

export const authed = (p: Pairing, header: string | undefined) => {
  const t = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(header ?? '')?.[1]
  return t ? [...p.tokens.keys()].some((k) => same(k, t)) : false
}

export type PanelView = { id: string; name: string; busy: boolean; goal: string | null; reply: string; asks: { id: string; tool: string; summary: string; risk?: string }[] }

/** What the phone sees of a panel: the folder name, not the path; the tail of the last reply. */
export function panelView(p: { id: string; cwd: string; busy: boolean; goal: string | null }, reply: string, asks: PanelView['asks']): PanelView {
  const name = p.cwd.split(/[\\/]/).filter(Boolean).pop() ?? p.id
  const r = reply.length > 800 ? `...${reply.slice(-800)}` : reply
  return { id: p.id, name, busy: p.busy, goal: p.goal, reply: r, asks: asks.map((a) => ({ id: a.id, tool: a.tool, summary: a.summary.slice(0, 300), ...(a.risk ? { risk: a.risk } : {}) })) }
}

/** The phone page: plain HTML, the brand's paper and ink, no outside files. */
export function page(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f3efe6"><title>SuperTokenMan</title>
<style>
:root{--bg:#f3efe6;--card:#fbf8f2;--ink:#2a2622;--faint:#7a7168;--line:#d9d1c4;--accent:#c65d3b;--ok:#4f7a4a;--bad:#b3412e;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#1b1917;--card:#24211e;--ink:#ece6dc;--faint:#9a9086;--line:#3a352f;--accent:#e07a55;--ok:#7fae78;--bad:#e06a55;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left))}
h1{font:600 13px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;margin:0 0 14px}
.card{background:var(--card);border:1px solid var(--line);padding:12px;margin:0 0 12px;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)}
.row{display:flex;gap:8px;align-items:center}.grow{flex:1;min-width:0}.faint{color:var(--faint);font-size:13px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--faint)}.dot.busy{background:var(--accent)}
pre{white-space:pre-wrap;word-break:break-word;font:13px/1.4 ui-monospace,monospace;margin:8px 0 0;max-height:220px;overflow:auto}
button{font:inherit;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:8px 14px;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)}
button.ok{background:var(--ok);color:#fff;border-color:var(--ok)}button.no{color:var(--bad);border-color:var(--bad)}
.ask{border-left:3px solid var(--accent);padding:8px;margin-top:8px}.ask.high{border-color:var(--bad)}
input,textarea{font:inherit;width:100%;padding:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
.err{color:var(--bad)}
</style></head><body><h1>SuperTokenMan</h1><div id="app"></div><script>
const $=(h)=>{const d=document.createElement('div');d.innerHTML=h;return d.firstElementChild}
const esc=(s)=>String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
let tok=null;try{tok=localStorage.getItem('stm.tok')}catch{}
const api=(path,body)=>fetch(path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined}).then(async(r)=>{const j=await r.json().catch(()=>({}));if(r.status===401){tok=null;try{localStorage.removeItem('stm.tok')}catch{};pair();throw new Error('Paired no longer')}if(!r.ok)throw new Error(j.error||r.statusText);return j})
const app=document.getElementById('app')
function pair(msg){app.innerHTML='';const c=$('<div class="card"><p>Turn on Phone companion in the app, then type the six-digit code it shows.</p><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Code"><p class="err" id="e"></p><button class="ok" id="go">Pair</button></div>');app.append(c);if(msg)c.querySelector('#e').textContent=msg
c.querySelector('#go').onclick=()=>api('/api/pair',{code:c.querySelector('#code').value,name:navigator.platform||'Phone'}).then((j)=>{tok=j.token;try{localStorage.setItem('stm.tok',tok)}catch{};load()},(e)=>c.querySelector('#e').textContent=e.message)}
let canSend=false
function render(s){canSend=s.send;app.innerHTML='';if(!s.panels.length)app.append($('<p class="faint">No panels open.</p>'))
for(const p of s.panels){const c=$('<div class="card"><div class="row"><span class="dot '+(p.busy?'busy':'')+'"></span><b class="grow">'+esc(p.name)+'</b><span class="faint">'+(p.busy?'working':'idle')+'</span></div>'+(p.goal?'<div class="faint">Goal: '+esc(p.goal)+'</div>':'')+(p.reply?'<pre>'+esc(p.reply)+'</pre>':'')+'</div>')
for(const a of p.asks){const k=$('<div class="ask '+(a.risk==='high'?'high':'')+'"><div><b>'+esc(a.tool)+'</b> wants to run</div><pre>'+esc(a.summary)+'</pre><div class="row" style="margin-top:8px"><button class="ok">Allow</button><button class="no">Deny</button></div></div>');const [y,n]=k.querySelectorAll('button');y.onclick=()=>api('/api/answer',{sid:p.id,id:a.id,allow:true}).then(load,alert);n.onclick=()=>api('/api/answer',{sid:p.id,id:a.id,allow:false}).then(load,alert);c.append(k)}
if(s.send&&!p.busy){const f=$('<div class="row" style="margin-top:8px"><textarea rows="1" aria-label="Message"></textarea><button>Send</button></div>');f.querySelector('button').onclick=()=>{const t=f.querySelector('textarea').value;if(t.trim())api('/api/send',{sid:p.id,text:t}).then(load,(e)=>alert(e.message))};c.append(f)}
app.append(c)}app.append($('<p class="faint">Spent today '+esc(s.today)+' · updated '+new Date().toLocaleTimeString()+'</p>'))}
function load(){if(!tok)return pair();api('/api/state').then(render,()=>{})}
load();setInterval(()=>{if(tok&&!document.activeElement?.matches('textarea,input'))load()},4000)
</script></body></html>`
}
