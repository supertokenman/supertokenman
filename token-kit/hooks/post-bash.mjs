#!/usr/bin/env node
// @ts-check
// PostToolUse (Bash): safety net for large outputs from commands that were not wrapped.
// Only acts on commands that succeeded (Claude Code does not allow replacing the output of failures).
import { loadConfig } from '../lib/config.mjs';
import { condense } from '../lib/condense.mjs';
import { run, readInput, isMain } from '../lib/hookio.mjs';
import { GENERIC, normalizeForMatch } from '../lib/profiles.mjs';
import { saveLog, recordStat } from '../lib/store.mjs';

/**
 * @param {any} input
 * @returns {object | null}
 */
export function decide(input, cfg = loadConfig(), save = saveLog) {
  const command = String(input.tool_input?.command || '');
  const res = input.tool_response;
  if (!cfg.enabled || !cfg.post.enabled || !res || typeof res !== 'object' || res.isImage) return null;
  if (/#\s*tk:raw\b/.test(command) || command.includes('tk-condense')) return null;
  const head = normalizeForMatch(command.replace(/^\s*(?:set -o pipefail;\s*)?(?:cd\s+\S+\s*&&\s*)*/, ''));
  if (cfg.post.skip.some((r) => new RegExp(r).test(head))) return null;

  const stdout = typeof res.stdout === 'string' ? res.stdout : '';
  const stderr = typeof res.stderr === 'string' ? res.stderr : '';
  if (stdout.length + stderr.length <= cfg.post.maxChars) return null;

  const out = condense(stdout, GENERIC, cfg.condense);
  const err = condense(stderr, GENERIC, cfg.condense);
  if (!out.changed && !err.changed) return null;

  let log;
  try {
    log = save(stderr ? `${stdout}\n===== stderr =====\n${stderr}` : stdout, 'post', cfg.logs);
  } catch {
    return null; // without the full output saved, leave it alone
  }
  const footer = `\n[token-kit] condensed output: ${out.inLines + (stderr ? err.inLines : 0)} -> ${out.outLines + (stderr ? err.outLines : 0)} lines. Full output: ${log}`;
  const newOut = out.text + footer;
  recordStat({ kind: 'post', profile: 'generic', cmd: command, inChars: stdout.length + stderr.length, outChars: newOut.length + err.text.length, session: input.session_id });
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      updatedToolOutput: { ...res, stdout: newOut, stderr: err.text },
    },
  };
}

if (isMain(import.meta.url)) run(() => decide(readInput()));
