#!/usr/bin/env node
// @ts-check
// Statusline: model and effort, context, 5h and 7d windows, cache and today's kit savings.
// Also saves the context snapshot for the warning hook (prompt-nudge).
import { readFileSync } from 'node:fs';
import { fromStatusInput, fmtK } from '../lib/context.mjs';
import { isMain } from '../lib/hookio.mjs';
import { readStats, writeState, sessionKey } from '../lib/store.mjs';

const color = process.env.NO_COLOR ? () => (/** @type {string} */ s) => s : (/** @type {number} */ c) => (/** @type {string} */ s) => `\x1b[${c}m${s}\x1b[0m`;
const green = color(32);
const yellow = color(33);
const red = color(31);
const dim = color(2);
const byPct = (/** @type {number} */ p, /** @type {string} */ s) => (p >= 80 ? red(s) : p >= 50 ? yellow(s) : green(s));

/**
 * @param {any} s JSON recebido pela statusline
 * @returns {string}
 */
export function render(s, now = Date.now(), savedToday = savedTokensToday()) {
  const snap = fromStatusInput(s, now);
  writeState(`ctx-${sessionKey(s.session_id)}`, snap);

  /** @type {string[]} */
  const parts = [];
  const model = s.model?.display_name || s.model?.id || '?';
  parts.push(s.effort?.level ? `${model} ${dim(s.effort.level)}` : model);

  if (snap.tokens) {
    const pct = snap.pct ?? (snap.window ? Math.round((snap.tokens / snap.window) * 100) : null);
    parts.push(pct != null ? byPct(pct, `ctx ${pct}% ${fmtK(snap.tokens)}`) : `ctx ${fmtK(snap.tokens)}`);
  }
  const hhmm = (/** @type {number} */ ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (snap.fiveHour) parts.push(byPct(snap.fiveHour.pct, `5h ${Math.round(snap.fiveHour.pct)}%`) + dim(` resets ${hhmm(snap.fiveHour.resetsAt)}`));
  if (snap.sevenDay) parts.push(byPct(snap.sevenDay.pct, `7d ${Math.round(snap.sevenDay.pct)}%`));
  if (snap.cacheExpiresAt) {
    const min = Math.round((snap.cacheExpiresAt - now) / 60000);
    parts.push(min > 0 ? dim(`cache ${min}min`) : yellow('cache cold'));
  }
  if (savedToday > 0) parts.push(green(`kit -${fmtK(savedToday)} today`));
  return parts.join(dim(' · '));
}

/** Estimate (chars/4) of what the kit kept out of context today. */
function savedTokensToday() {
  const today = new Date().toISOString().slice(0, 10);
  let saved = 0;
  // read-guard is left out: after a block Claude reads a section, and there is no way to know how much
  for (const e of readStats(1)) if (e.ts.startsWith(today) && e.kind !== 'read-guard') saved += Math.max(0, e.inChars - e.outChars);
  return Math.round(saved / 4);
}

if (isMain(import.meta.url)) {
  try {
    process.stdout.write(render(JSON.parse(readFileSync(0, 'utf8'))));
  } catch {
    process.stdout.write('token-kit');
  }
}
