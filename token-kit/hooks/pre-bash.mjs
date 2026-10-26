#!/usr/bin/env node
// @ts-check
// PreToolUse (Bash): passes the command through RTK, if installed, and wraps noisy commands
// (tests, build, install, deploy) with the condenser. The full output is kept in a log.
import { loadConfig } from '../lib/config.mjs';
import { run, readInput, isMain } from '../lib/hookio.mjs';
import { condenseInvocation } from '../lib/paths.mjs';
import { profileFor, normalizeForMatch } from '../lib/profiles.mjs';
import { rtkRewrite } from '../lib/rtk.mjs';
import { wrapCommand } from '../lib/shell.mjs';

/**
 * @param {any} input
 * @returns {object | null}
 */
export function decide(input, cfg = loadConfig(), rewrite = rtkRewrite) {
  const ti = input.tool_input || {};
  const original = typeof ti.command === 'string' ? ti.command : '';
  if (!cfg.enabled || !original || ti.run_in_background) return null;
  if (/#\s*tk:raw\b/.test(original) || original.includes('tk-condense') || /^\s*rtk\s/.test(original)) return null;

  let command = original;
  let allow = false;
  const lossSensitive = (cfg.rtk.skip || []).some((r) => new RegExp(r).test(normalizeForMatch(original.replace(/^\s*(?:cd\s+\S+\s*&&\s*)+/, ''))));
  if (cfg.rtk.mode === 'auto' && !lossSensitive) {
    const r = rewrite(original);
    if (r) {
      command = r.command;
      allow = r.allow;
    }
  }

  const wrapped = wrapCommand(
    command,
    (seg) => (/^rtk\s/.test(seg.text) ? null : profileFor(seg.text, cfg.profiles)?.name ?? null),
    condenseInvocation(),
    input.session_id,
  );
  if (wrapped) {
    command = wrapped.command;
    // new parts in the command: the decision goes back to the normal permission rules
    allow = false;
  }
  if (command === original) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...ti, command },
      ...(allow ? { permissionDecision: 'allow', permissionDecisionReason: 'token-kit/rtk: an allow rule matched the original command' } : {}),
    },
  };
}

if (isMain(import.meta.url)) run(() => decide(readInput()));
