// @ts-check
import { IMPORTANT, WARNING, NOISE } from './profiles.mjs';

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]/g;
const MAX_LINE = 400;

/** Strips ANSI colors, \r rewrites (progress bars) and trailing whitespace. */
export function clean(raw) {
  return raw
    .replace(ANSI, '')
    .split('\n')
    .map((line) => {
      const parts = line.split('\r').filter((p) => p.trim() !== '');
      return (parts.length ? parts[parts.length - 1] : '').trimEnd();
    });
}

/**
 * @typedef {object} CondenseOptions
 * @property {number} maxLines
 * @property {number} maxChars
 * @property {number} head
 * @property {number} tail
 * @property {number} context
 * @property {number} maxBlocks
 */

/**
 * @typedef {object} CondenseResult
 * @property {string} text      output to show
 * @property {boolean} changed  false when the output was small and passed through untouched
 * @property {number} inLines
 * @property {number} outLines
 */

/**
 * Reduces a long output to: head, tail, profile summary lines and error blocks with context.
 * Small output passes through untouched.
 * @param {string} raw
 * @param {import('./profiles.mjs').Profile} profile
 * @param {CondenseOptions} opt
 * @returns {CondenseResult}
 */
export function condense(raw, profile, opt) {
  const rawLines = raw.split('\n');
  if (rawLines.length <= opt.maxLines && raw.length <= opt.maxChars) {
    return { text: raw, changed: false, inLines: rawLines.length, outLines: rawLines.length };
  }

  const isKeep = (/** @type {string} */ l) => profile.keep.some((r) => r.test(l));
  const isImportant = (/** @type {string} */ l) => IMPORTANT.test(l) || isKeep(l);

  // 1. cleanup, noise and consecutive duplicate lines
  /** @type {string[]} */
  const lines = [];
  /** @type {number[]} */
  const repeats = [];
  for (const l of clean(raw)) {
    // a profile's explicit drop beats its keep (e.g. a passing test named "1 passed"); errors are never dropped
    if (profile.drop.some((r) => r.test(l)) ? !IMPORTANT.test(l) : !isImportant(l) && NOISE.some((r) => r.test(l))) continue;
    if (lines.length && lines[lines.length - 1] === l) {
      repeats[lines.length - 1]++;
      continue;
    }
    lines.push(l);
    repeats.push(1);
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
    repeats.pop();
  }

  const render = (/** @type {number} */ i) => {
    const l = lines[i].length > MAX_LINE ? `${lines[i].slice(0, MAX_LINE)}… [+${lines[i].length - MAX_LINE} chars]` : lines[i];
    return repeats[i] > 1 ? `${l}  [repeated ${repeats[i]}x]` : l;
  };

  const filteredChars = lines.reduce((n, l) => n + Math.min(l.length, MAX_LINE) + 1, 0);
  if (lines.length <= opt.maxLines && filteredChars <= opt.maxChars) {
    const text = lines.map((_, i) => render(i)).join('\n');
    return { text, changed: true, inLines: rawLines.length, outLines: lines.length };
  }

  // 2. selection: head, tail, summary lines and error blocks with context
  const n = lines.length;
  const pick = new Uint8Array(n);
  const tail = profile.tail ?? opt.tail;
  for (let i = 0; i < Math.min(opt.head, n); i++) pick[i] = 1;
  for (let i = Math.max(0, n - tail); i < n; i++) pick[i] = 1;

  /** @type {Array<[number, number]>} */
  const blocks = [];
  /** @type {Set<string>} */
  const seenWarnings = new Set();
  let warningsSkipped = 0;
  for (let i = 0; i < n; i++) {
    const l = lines[i];
    if (isKeep(l)) pick[i] = 1;
    if (IMPORTANT.test(l)) {
      const from = Math.max(0, i - opt.context);
      const to = Math.min(n - 1, i + opt.context);
      const last = blocks[blocks.length - 1];
      if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
      else blocks.push([from, to]);
    } else if (WARNING.test(l)) {
      const key = l.replace(/\d+/g, '#').slice(0, 120);
      if (seenWarnings.size < 3 && !seenWarnings.has(key)) {
        seenWarnings.add(key);
        pick[i] = 1;
      } else if (!pick[i]) warningsSkipped++;
    }
  }

  let blocksSkipped = 0;
  const kept = blocks.length > opt.maxBlocks ? [...blocks.slice(0, opt.maxBlocks - 1), blocks[blocks.length - 1]] : blocks;
  blocksSkipped = blocks.length - kept.length;
  for (const [a, b] of kept) for (let i = a; i <= b; i++) pick[i] = 1;

  // 3. assembly with cut markers
  /** @type {string[]} */
  const out = [];
  let gap = 0;
  let chars = 0;
  let truncatedByChars = 0;
  for (let i = 0; i < n; i++) {
    if (!pick[i]) {
      gap++;
      continue;
    }
    if (gap) out.push(`… [${gap} line${gap > 1 ? 's' : ''} omitted] …`);
    gap = 0;
    const r = render(i);
    // character budget: the end of the output (summary) matters most, so only cut before it
    if (chars + r.length > opt.maxChars * 2 && i < n - tail) {
      truncatedByChars++;
      continue;
    }
    chars += r.length + 1;
    out.push(r);
  }
  if (gap) out.push(`… [${gap} line${gap > 1 ? 's' : ''} omitted] …`);

  /** @type {string[]} */
  const notes = [];
  if (blocksSkipped) notes.push(`${blocksSkipped} error block(s) omitted`);
  if (warningsSkipped) notes.push(`${warningsSkipped} repeated warning(s) omitted`);
  if (truncatedByChars) notes.push(`${truncatedByChars} line(s) cut by the size limit`);
  if (notes.length) out.push(`… [${notes.join('; ')}] …`);

  return { text: out.join('\n'), changed: true, inLines: rawLines.length, outLines: out.length };
}
