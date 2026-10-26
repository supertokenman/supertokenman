// @ts-check
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';

/**
 * @typedef {object} ContextSnapshot
 * @property {number} tokens        input tokens of the last response (the context size)
 * @property {number | null} pct    % of the window, when known
 * @property {number | null} window window size, when known
 * @property {number | null} cacheExpiresAt epoch ms when the cache goes cold
 * @property {{ pct: number, resetsAt: number } | null} fiveHour
 * @property {{ pct: number, resetsAt: number } | null} sevenDay
 * @property {number} at            epoch ms of the reading
 */

/**
 * Turns the JSON the statusline receives into a context snapshot.
 * @param {any} s
 * @returns {ContextSnapshot}
 */
export function fromStatusInput(s, now = Date.now()) {
  const cw = s.context_window || {};
  const cu = cw.current_usage || {};
  const tokens = cw.total_input_tokens || (cu.input_tokens || 0) + (cu.cache_creation_input_tokens || 0) + (cu.cache_read_input_tokens || 0);
  const rl = s.rate_limits || {};
  const win = (/** @type {any} */ w) => (w && typeof w.used_percentage === 'number' ? { pct: w.used_percentage, resetsAt: (w.resets_at || 0) * 1000 } : null);
  return {
    tokens,
    pct: typeof cw.used_percentage === 'number' ? cw.used_percentage : null,
    window: cw.context_window_size || null,
    cacheExpiresAt: s.prompt_cache?.expires_at ? s.prompt_cache.expires_at * 1000 : null,
    fiveHour: win(rl.five_hour),
    sevenDay: win(rl.seven_day),
    at: now,
  };
}

/**
 * Fallback without a statusline: reads the end of the transcript and takes the last response's usage.
 * @param {string} path
 * @returns {{ tokens: number, lastAt: number } | null}
 */
export function fromTranscript(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const line of lines) {
      if (!line.includes('"usage"')) continue;
      try {
        const e = JSON.parse(line);
        const u = e.message?.usage;
        if (e.type !== 'assistant' || !u || e.isSidechain) continue;
        return {
          tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
          lastAt: Date.parse(e.timestamp) || 0,
        };
      } catch {
        // line cut at the start of the buffer
      }
    }
  } catch {
    // no transcript
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return null;
}

export const fmtK = (/** @type {number} */ n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
