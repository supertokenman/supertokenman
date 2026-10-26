// @ts-check
import { mkdirSync, writeFileSync, appendFileSync, readdirSync, statSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { logsDir, stateDir, dataDir } from './paths.mjs';

/**
 * Saves the full output so Claude can consult it later (grep/sed on the file).
 * @param {string} text
 * @param {string} label
 * @param {{ keepDays: number, maxFiles: number }} limits
 * @returns {string} log path
 */
export function saveLog(text, label, limits) {
  const dir = logsDir();
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const hash = createHash('sha1').update(text).update(String(process.pid)).digest('hex').slice(0, 6);
  const safe = label.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 30);
  const file = join(dir, `${stamp}-${safe}-${hash}.log`);
  writeFileSync(file, text);
  prune(dir, limits);
  return file;
}

/**
 * @param {string} dir
 * @param {{ keepDays: number, maxFiles: number }} limits
 */
function prune(dir, limits) {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    const cutoff = Date.now() - limits.keepDays * 86400000;
    files.forEach(({ f, t }, i) => {
      if (i >= limits.maxFiles || t < cutoff) unlinkSync(join(dir, f));
    });
  } catch {
    // cleanup is best effort
  }
}

/**
 * @typedef {object} StatEntry
 * @property {string} ts
 * @property {string} kind     wrap | post | read-guard
 * @property {string} profile
 * @property {string} cmd
 * @property {number} inChars
 * @property {number} outChars
 * @property {string} [session] session id, used to count avoided re-reads
 */

const statsFile = (d = new Date()) => join(dataDir(), `stats-${d.toISOString().slice(0, 7)}.jsonl`);

/** @param {Omit<StatEntry, 'ts'>} e */
export function recordStat(e) {
  try {
    mkdirSync(dataDir(), { recursive: true });
    appendFileSync(statsFile(), JSON.stringify({ ts: new Date().toISOString(), ...e, cmd: e.cmd.slice(0, 120) }) + '\n');
  } catch {
    // stats must never break the hook
  }
}

/**
 * Reads entries from the last `days` days.
 * @param {number} days
 * @returns {StatEntry[]}
 */
export function readStats(days) {
  const since = Date.now() - days * 86400000;
  /** @type {Set<string>} */
  const files = new Set();
  for (let t = since; t <= Date.now() + 86400000; t += 86400000 * 27) files.add(statsFile(new Date(t)));
  files.add(statsFile());
  /** @type {StatEntry[]} */
  const out = [];
  for (const f of files) {
    let txt = '';
    try {
      txt = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const line of txt.split('\n')) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        if (Date.parse(e.ts) >= since) out.push(e);
      } catch {
        // corrupted line (concurrent write): skip
      }
    }
  }
  return out;
}

/**
 * Small JSON state (statusline -> nudge, read-guard).
 * @param {string} name
 * @returns {any}
 */
export function readState(name) {
  try {
    return JSON.parse(readFileSync(join(stateDir(), `${name}.json`), 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * @param {string} name
 * @param {unknown} value
 */
export function writeState(name, value) {
  try {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(join(stateDir(), `${name}.json`), JSON.stringify(value));
  } catch {
    // best effort
  }
}

/** Safe file name from a session id. */
export function sessionKey(id) {
  return String(id || 'no-session').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'no-session';
}
