#!/usr/bin/env node
// @ts-check
// Stop (runs in the background): rewrites this session's note in the memory vault from the transcript.
// No model call, so it costs no tokens. Does nothing until a vault is configured (tk vault init).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { run, readInput, isMain } from '../lib/hookio.mjs';
import { usdRate } from '../lib/money.mjs';
import { buildNote, notePath, projectName, projectRoot, vaultPath } from '../lib/vault.mjs';

/**
 * @param {any} input
 * @returns {string | null} path written
 */
export function writeNote(input, cfg = loadConfig()) {
  const vault = vaultPath(cfg.vault.path);
  if (!cfg.enabled || !vault || !input.transcript_path || !input.session_id) return null;
  const entries = [];
  for (const line of readFileSync(input.transcript_path, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // partial line while the transcript is being written
    }
  }
  if (!entries.some((e) => e.type === 'assistant')) return null;
  const root = projectRoot(input.cwd || process.cwd());
  const project = projectName(root);
  const note = buildNote(entries, { session: input.session_id, project, root, rate: usdRate(cfg.money).rate, currency: cfg.money.currency });
  const day = (note.match(/^date: (\S+)/m) || [])[1] || new Date().toISOString().slice(0, 10);
  const file = notePath(vault, project, day, input.session_id);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, note);
  return file;
}

if (isMain(import.meta.url))
  run(() => {
    writeNote(readInput());
    return null;
  });
