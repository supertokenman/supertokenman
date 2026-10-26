#!/usr/bin/env node
// @ts-check
// UserPromptSubmit: warns YOU (systemMessage, never sent to the model) when the context is large,
// when the cache went cold and the next message will reprocess everything, or when the 5h window is running out.
import { loadConfig } from '../lib/config.mjs';
import { fromTranscript, fmtK } from '../lib/context.mjs';
import { run, readInput, isMain } from '../lib/hookio.mjs';
import { readState, writeState, sessionKey } from '../lib/store.mjs';

const ONE_HOUR = 3600000;

/**
 * @param {any} input
 * @returns {object | null}
 */
export function decide(input, cfg = loadConfig(), now = Date.now()) {
  const n = cfg.nudge;
  if (!cfg.enabled || !n.enabled) return null;
  const sk = sessionKey(input.session_id);
  /** @type {import('../lib/context.mjs').ContextSnapshot | undefined} */
  const snap = readState(`ctx-${sk}`);
  const fromT = input.transcript_path ? fromTranscript(input.transcript_path) : null;
  const fresh = snap && now - snap.at < 6 * ONE_HOUR ? snap : null;

  const tokens = fromT?.tokens ?? fresh?.tokens ?? 0;
  const pct = fresh?.window ? Math.round((tokens / fresh.window) * 100) : null;
  /** @type {{ ctx?: number, fiveHour?: number, cacheAt?: number }} */
  const sent = readState(`nudge-${sk}`) || {};
  /** @type {string[]} */
  const msgs = [];

  // context: one warning per step (e.g. 60% and 85%), by percentage when the window size is known
  const steps = pct != null ? n.contextPct : n.contextTokens;
  const value = pct != null ? pct : tokens;
  const level = steps.filter((s) => value >= s).length;
  if (level > (sent.ctx || 0)) {
    const where = pct != null ? `${pct}% of the window (${fmtK(tokens)} tokens)` : `${fmtK(tokens)} tokens`;
    msgs.push(
      level >= steps.length
        ? `Context at ${where}: every message re-reads all of it. Run /compact now (e.g. "/compact keep only the decisions and the next step") or /clear if you changed topics.`
        : `Context at ${where}. If you changed topics, /clear is much cheaper; otherwise consider a focused /compact.`,
    );
  }
  sent.ctx = level; // after /compact the level drops and the steps apply again

  // cache: past the TTL since the last response, so this message reprocesses the whole context at full price
  const lastAt = fromT?.lastAt || 0;
  const expiresAt = fresh?.cacheExpiresAt || (lastAt ? lastAt + ONE_HOUR : 0);
  if (expiresAt && now > expiresAt && tokens >= n.cacheMinTokens && sent.cacheAt !== lastAt) {
    const idle = lastAt ? Math.round((now - lastAt) / 60000) : null;
    msgs.push(
      `Cache expired${idle ? ` (idle for ${idle} min)` : ''}: this message reprocesses ~${fmtK(tokens)} tokens from scratch. ` +
        'If this is a new topic, /clear first is cheaper.',
    );
    sent.cacheAt = lastAt;
  }

  // the plan's 5h window
  const fh = fresh?.fiveHour;
  if (fh && fh.pct >= n.fiveHourPct && (sent.fiveHour || 0) < fh.resetsAt) {
    const at = new Date(fh.resetsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    msgs.push(`You have used ${Math.round(fh.pct)}% of the 5h window (resets at ${at}). Prefer Sonnet/Haiku and low effort for mechanical work.`);
    sent.fiveHour = fh.resetsAt;
  }

  writeState(`nudge-${sk}`, sent);
  if (!msgs.length) return null;
  return { systemMessage: `token-kit: ${msgs.join(' | ')}` };
}

if (isMain(import.meta.url)) run(() => decide(readInput()));
