// Scheduling links (idea from cal.diy, MIT; no code taken): free times from the calendars already
// connected, a booking page served by your own Cloudflare Worker, and booking requests you accept or
// decline in the app. Publishing the page is a deploy: a click and a confirm.

export type Busy = { start: string; end: string }
export type SlotRules = { days: number; from: string; to: string; minutes: number; buffer: number; weekdays: number[]; notBeforeHours: number }
export type Slot = { start: string; end: string }

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Free slots of `minutes`, inside working hours on the chosen weekdays, clear of busy time and its buffer. */
export function freeSlots(busy: Busy[], r: SlotRules, now = new Date()): Slot[] {
  const out: Slot[] = []
  const blocks = busy.map((b) => [Date.parse(b.start) - r.buffer * 60_000, Date.parse(b.end) + r.buffer * 60_000] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  const earliest = now.getTime() + r.notBeforeHours * 3_600_000
  for (let d = 0; d < r.days; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    if (!r.weekdays.includes(day.getDay())) continue
    for (let t = hm(r.from); t + r.minutes <= hm(r.to); t += r.minutes) {
      const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, t).getTime()
      const e = s + r.minutes * 60_000
      if (s < earliest) continue
      if (blocks.some(([a, b]) => s < b && e > a)) continue
      out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString() })
    }
  }
  return out
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * The Worker: GET / shows the free slots (minus ones already requested), POST /book stores a request in
 * KV, and GET/POST /requests with the owner's token lists them and records a decision.
 */
export function workerScript(o: { title: string; who: string; minutes: number; slots: Slot[] }): string {
  const data = JSON.stringify({ title: o.title, who: o.who, minutes: o.minutes, slots: o.slots })
  return `// Booking page written by SuperTokenMan. Requests are stored in KV (BOOK); only TOKEN can read them.
const DATA = ${data};
const page = (taken, msg) => {
  const free = DATA.slots.filter((s) => !taken.includes(s.start));
  const byDay = {};
  for (const s of free) (byDay[s.start.slice(0, 10)] ??= []).push(s);
  const days = Object.entries(byDay).map(([d, list]) => '<section><h2>' + new Date(d + 'T12:00:00Z').toDateString() + '</h2>' + list.map((s) => '<label><input type="radio" name="slot" value="' + s.start + '" required>' + new Date(s.start).toISOString().slice(11, 16) + ' UTC</label>').join('') + '</section>').join('');
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.title)}</title><style>body{font:15px system-ui;max-width:640px;margin:40px auto;padding:0 16px;color:#1f1e1b;background:#faf9f5}h1{font-size:22px}h2{font:600 12px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:#c15f3c;margin:20px 0 8px}label{display:inline-flex;gap:6px;margin:0 10px 8px 0;padding:6px 10px;border:1px solid #d6d2c4}input,textarea{font:inherit}form>p{display:grid;gap:4px}button{background:#c15f3c;color:#fff;border:0;padding:8px 16px;font-weight:600}.m{padding:10px;border-left:3px solid #c15f3c;background:#fff}</style><h1>${esc(o.title)}</h1><p>${esc(o.who)} · ${o.minutes} minutes. Pick a time; it is a request until confirmed.</p>' + (msg ? '<p class=m>' + msg + '</p>' : '') + '<form method=post action=/book>' + (days || '<p>No free times right now.</p>') + '<p><span>Your name</span><input name=name required maxlength=80></p><p><span>Your email</span><input name=email type=email required maxlength=120></p><p><span>What about</span><textarea name=note maxlength=500></textarea></p><button>Request this time</button></form>';
};
const html = (b, s = 200) => new Response(b, { status: s, headers: { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY' } });
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
async function all(env) { return JSON.parse((await env.BOOK.get('requests')) || '[]'); }
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const list = await all(env);
    const taken = list.filter((r) => r.status !== 'declined').map((r) => r.slot);
    if (url.pathname === '/' && req.method === 'GET') return html(page(taken, ''));
    if (url.pathname === '/book' && req.method === 'POST') {
      const f = await req.formData();
      const slot = String(f.get('slot') || '');
      if (!DATA.slots.some((s) => s.start === slot) || taken.includes(slot)) return html(page(taken, 'That time is no longer free. Pick another.'), 409);
      const r = { id: crypto.randomUUID(), slot, name: String(f.get('name') || '').slice(0, 80), email: String(f.get('email') || '').slice(0, 120), note: String(f.get('note') || '').slice(0, 500), at: new Date().toISOString(), status: 'pending' };
      if (!r.name || !/^[^@\\s]+@[^@\\s]+$/.test(r.email)) return html(page(taken, 'Name and a valid email, please.'), 400);
      list.push(r);
      await env.BOOK.put('requests', JSON.stringify(list.slice(-500)));
      return html(page([...taken, slot], 'Requested. You will get a confirmation by email.'));
    }
    if (url.pathname.startsWith('/requests')) {
      if (req.headers.get('authorization') !== 'Bearer ' + env.TOKEN) return json({ error: 'unauthorized' }, 401);
      if (req.method === 'GET') return json(list);
      const id = url.pathname.split('/')[2];
      const { status } = await req.json();
      const r = list.find((x) => x.id === id);
      if (!r || !['accepted', 'declined'].includes(status)) return json({ error: 'bad request' }, 400);
      r.status = status;
      await env.BOOK.put('requests', JSON.stringify(list));
      return json(r);
    }
    return html('Not found', 404);
  },
};
`
}
