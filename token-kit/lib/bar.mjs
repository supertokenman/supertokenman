// @ts-check
// Menu bar numbers: real usage (from transcripts) and kit savings, today and over the last 7 days.
// Everything in USD at each model's API list price (lib/pricing.mjs), converted for display.
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { findTranscripts } from './analyze.mjs';
import { requestUsd, savedUsd } from './pricing.mjs';
import { fmtMoney } from './money.mjs';
import { readStats, readState, writeState } from './store.mjs';
import { stateDir } from './paths.mjs';
import { hudButton, hudCard } from './hud-png.mjs';

/**
 * Requests in a transcript: [epoch ms, USD, model], counting split messages once.
 * Cached per file (mtime + size) so the bar does not re-read everything on every refresh.
 * @param {string} file
 * @param {Record<string, any>} cache
 * @returns {Array<[number, number, string]>}
 */
function requestsOf(file, cache) {
  const st = statSync(file);
  const key = `${st.mtimeMs}:${st.size}`;
  if (cache[file]?.key === key) return cache[file].reqs;
  /** @type {Array<[number, number, string]>} */
  const reqs = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue;
    try {
      const e = JSON.parse(line);
      const m = e.message;
      if (e.type !== 'assistant' || !m?.usage || !m.id || seen.has(m.id) || m.model === '<synthetic>') continue;
      seen.add(m.id);
      reqs.push([Date.parse(e.timestamp) || 0, requestUsd(m.usage, m.model), m.model]);
    } catch {
      // truncated line
    }
  }
  cache[file] = { key, reqs };
  return reqs;
}

/** Session id from the path: `<id>.jsonl` or `<id>/subagents/agent-x.jsonl`. */
const sessionOf = (/** @type {string} */ f) => (/[\\/]subagents[\\/]/.test(f) ? basename(dirname(dirname(f))) : basename(f, '.jsonl'));

/**
 * @typedef {object} Period
 * @property {number} used     USD at API prices
 * @property {number} saved    USD saved (direct + avoided re-reads)
 * @property {number} direct   direct part only (what never entered the context)
 * @property {number} sessions
 * @property {number} cuts     condensed outputs
 * @property {number} blocked  large reads blocked
 */

/**
 * @param {string} projectsDir
 * @param {number} [now]
 */
export function computeBar(projectsDir, now = Date.now()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const since = { today: midnight.getTime(), week: now - 7 * 86400000 };
  const cache = readState('bar-cache-usd') || {};

  /** @type {Map<string, { times: number[], model: string }>} requests per session (to count re-reads) */
  const bySession = new Map();
  /** @type {Record<'today' | 'week', Period>} */
  const p = {
    today: { used: 0, saved: 0, direct: 0, sessions: 0, cuts: 0, blocked: 0 },
    week: { used: 0, saved: 0, direct: 0, sessions: 0, cuts: 0, blocked: 0 },
  };
  /** @type {Record<'today' | 'week', Set<string>>} */
  const active = { today: new Set(), week: new Set() };
  // 7 calendar days (today is the last) for the chart
  const day0 = midnight.getTime() - 6 * 86400000;
  const days = Array.from({ length: 7 }, (_, i) => ({ start: day0 + i * 86400000, used: 0, saved: 0 }));
  const dayOf = (/** @type {number} */ t) => (t >= day0 ? days[Math.min(6, Math.floor((t - day0) / 86400000))] : null);

  for (const f of findTranscripts(projectsDir, 8)) {
    const sid = sessionOf(f);
    let reqs;
    try {
      reqs = requestsOf(f, cache);
    } catch {
      continue;
    }
    const s = bySession.get(sid) || { times: [], model: '' };
    for (const [t, u, model] of reqs) {
      s.times.push(t);
      s.model = model || s.model;
      const d = dayOf(t);
      if (d) d.used += u;
      for (const k of /** @type {const} */ (['today', 'week'])) {
        if (t >= since[k]) {
          p[k].used += u;
          active[k].add(sid);
        }
      }
    }
    bySession.set(sid, s);
  }
  // keep cache entries only for files that still exist
  for (const f of Object.keys(cache)) {
    try {
      statSync(f);
    } catch {
      delete cache[f];
    }
  }
  writeState('bar-cache-usd', cache);

  for (const e of readStats(8)) {
    const t = Date.parse(e.ts);
    let counted = false;
    for (const k of /** @type {const} */ (['today', 'week'])) {
      if (t < since[k]) continue;
      if (e.kind === 'read-guard') {
        p[k].blocked++;
        continue;
      }
      const tokens = Math.max(0, e.inChars - e.outChars) / 4;
      // what never entered is not written to the cache nor re-read on each following request of the session
      const s = e.session ? bySession.get(e.session) : undefined;
      const rereads = s ? s.times.filter((x) => x > t).length : 0;
      const saved = savedUsd(tokens, rereads, s?.model);
      p[k].direct += savedUsd(tokens, 0, s?.model);
      p[k].saved += saved;
      p[k].cuts++;
      const d = dayOf(t);
      if (d && !counted) d.saved += saved;
      counted = true;
    }
  }
  p.today.sessions = active.today.size;
  p.week.sessions = active.week.size;
  return { ...p, days, plan: latestPlan(now) };
}

/** Latest plan window reading saved by a statusline (terminal sessions only). */
function latestPlan(now) {
  /** @type {any} */
  let best = null;
  try {
    for (const f of readdirSync(stateDir())) {
      if (!f.startsWith('ctx-')) continue;
      const s = readState(f.slice(0, -5));
      if (s && (s.fiveHour || s.sevenDay) && (!best || s.at > best.at)) best = s;
    }
  } catch {
    // no state
  }
  if (!best || now - best.at > 12 * 3600000) return null;
  const alive = (/** @type {any} */ w) => (w && w.resetsAt > now ? w : null);
  return { at: best.at, fiveHour: alive(best.fiveHour), sevenDay: alive(best.sevenDay) };
}

const pct = (/** @type {Period} */ x) => (x.used + x.saved > 0 ? Math.round((x.saved / (x.used + x.saved)) * 100) : 0);
const hhmm = (/** @type {number} */ ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const plural = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Claude palette; each text color is a light,dark pair that SwiftBar picks by the macOS appearance. */
export const THEME = { dark: '#141413', light: '#faf9f5', midGray: '#b0aea5', orange: '#d97757' };
const T = THEME;

/**
 * @typedef {object} MoneyView
 * @property {string} currency
 * @property {number} rate            USD -> currency
 * @property {string} source
 * @property {number} at
 * @property {number} planMonthlyUsd
 */

/** What the SuperTokenMan card draws, from the bar's numbers. */
export function cardView(/** @type {ReturnType<typeof computeBar>} */ d, /** @type {(usd: number) => string} */ $, footer = '') {
  /** @type {import('./hud-png.mjs').CardView['plan']} */
  const plan = [];
  if (d.plan?.fiveHour) plan.push({ label: '5H', left: 1 - d.plan.fiveHour.pct / 100, note: `${Math.round(100 - d.plan.fiveHour.pct)}%  ${hhmm(d.plan.fiveHour.resetsAt)}` });
  if (d.plan?.sevenDay) plan.push({ label: '7D', left: 1 - d.plan.sevenDay.pct / 100, note: `${Math.round(100 - d.plan.sevenDay.pct)}%` });
  return {
    score: $(d.today.used),
    saved: $(d.today.saved),
    power: pct(d.today) / 100,
    kos: d.today.cuts,
    sessions: d.today.sessions,
    blocked: d.today.blocked,
    plan,
    days: d.days.map((x, i) => ({ letter: 'SMTWTFS'[new Date(x.start).getDay()], used: x.used, saved: x.saved, today: i === d.days.length - 1 })),
    week: $(d.week.used),
    weekSaved: $(d.week.saved),
    footer,
  };
}

/**
 * SwiftBar/xbar output: the first line goes in the menu bar, the menu comes after `---`.
 * The menu is the SuperTokenMan card (a pixel-art PNG at 2x, shown at its point size), then the actions.
 * Amounts are the API value of the work, converted to the user's currency.
 * @param {ReturnType<typeof computeBar>} d
 * @param {{ node: string, tk: string }} run how to launch tk again from the menu
 * @param {MoneyView} money
 */
export function renderSwiftBar(d, run, money) {
  const $ = (/** @type {number} */ usd) => fmtMoney(usd * money.rate, money.currency);
  const lines = [];
  lines.push(d.today.saved > 0 ? `${$(d.today.saved)} saved | color=${T.orange},${T.orange}` : `${$(d.today.used)} used`);
  lines.push('---');
  const fx = money.currency === 'USD' ? '' : `  ·  US$1 = ${fmtMoney(money.rate, money.currency)}`;
  const card = hudCard(cardView(d, $, `API LIST PRICES${fx}`));
  const tip = `Today ${$(d.today.used)} used, ${$(d.today.saved)} saved (${pct(d.today)}%), ${plural(d.today.cuts, 'cut')}. Last 7 days ${$(d.week.used)} used, ${$(d.week.saved)} saved.`;
  lines.push(`| image=${card.png.toString('base64')} width=${card.width} height=${card.height} tooltip="${tip}"`);
  const share = d.week.used + d.week.saved > 0 ? d.week.saved / (d.week.used + d.week.saved) : 0;
  // the rows below the card, drawn as buttons in its style: each line still runs its command
  const button = (/** @type {string} */ label, /** @type {string} */ action, arrow = true) => {
    const b = hudButton(label, arrow);
    lines.push(`| image=${b.png.toString('base64')} width=${b.width} height=${b.height} ${action}`);
  };
  if (share > 0 && money.planMonthlyUsd > 0) {
    const freed = $(share * money.planMonthlyUsd);
    button(`PLAN CAPACITY FREED  ${freed}/MONTH`, `tooltip="Plan capacity freed: ${freed}/month, ${Math.round(share * 100)}% of a ${fmtMoney(money.planMonthlyUsd, 'USD')} plan"`, false);
  }
  button('DETAILED ANALYSIS  ·  30 DAYS', `bash="${run.node}" param1="${run.tk}" param2=analyze terminal=true`);
  button('KIT DIAGNOSTICS', `bash="${run.node}" param1="${run.tk}" param2=doctor terminal=true`);
  button('REFRESH', 'refresh=true');
  return lines.join('\n') + '\n';
}
