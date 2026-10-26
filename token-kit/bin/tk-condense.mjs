#!/usr/bin/env node
// @ts-check
// Usage: <command> 2>&1 | node tk-condense.mjs --profile test
// Reads the whole output, saves it to a log and prints the condensed version.
import { loadConfig } from '../lib/config.mjs';
import { condense } from '../lib/condense.mjs';
import { profileByName } from '../lib/profiles.mjs';
import { saveLog, recordStat } from '../lib/store.mjs';

const args = process.argv.slice(2);
const arg = (/** @type {string} */ k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const name = arg('--profile') || 'generic';
const session = arg('--session');

/** @type {Buffer[]} */
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const raw = Buffer.concat(chunks).toString('utf8');
  const cfg = loadConfig();
  const res = condense(raw, profileByName(name, cfg.profiles), cfg.condense);
  if (!res.changed) {
    process.stdout.write(raw);
    return;
  }
  let log;
  try {
    log = saveLog(raw, name, cfg.logs);
  } catch {
    // nowhere to keep the full output: do not condense, nothing may be lost
    process.stdout.write(raw);
    return;
  }
  const text = `${res.text}\n[token-kit] condensed output (profile ${name}): ${res.inLines} -> ${res.outLines} lines. Full output: ${log}\n`;
  process.stdout.write(text);
  recordStat({ kind: 'wrap', profile: name, cmd: name, inChars: raw.length, outChars: text.length, session });
});
