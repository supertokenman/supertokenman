#!/usr/bin/env node
// @ts-check
// PreToolUse (Read): blocks the first full read of a large file and suggests Grep + offset/limit.
// Repeating the same call goes through, so Claude is never left without a file it really needs in full.
import { statSync, readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { run, readInput, isMain } from '../lib/hookio.mjs';
import { readState, writeState, sessionKey, recordStat } from '../lib/store.mjs';

const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf', '.ipynb', '.svg', '.mp4', '.mov', '.mp3', '.wav', '.zip']);
const GENERATED = /(?:^|[\\/])(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|Pipfile\.lock|uv\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|\.min\.(?:js|css)$|\.map$/;

/**
 * @param {any} input
 * @returns {object | null}
 */
export function decide(input, cfg = loadConfig(), now = Date.now()) {
  const g = cfg.readGuard;
  const ti = input.tool_input || {};
  const file = String(ti.file_path || '');
  if (!cfg.enabled || !g.enabled || !file || ti.offset != null || ti.limit != null || ti.pages != null) return null;
  if (BINARY.has(extname(file).toLowerCase())) return null;

  let size;
  try {
    const st = statSync(file);
    if (!st.isFile()) return null;
    size = st.size;
  } catch {
    return null;
  }
  const generated = GENERATED.test(file.replace(/\\/g, '/'));
  let lines = 0;
  if (!generated && size > 4096 && size < 20_000_000) {
    const buf = readFileSync(file);
    for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
  }
  const big = generated ? size > g.generatedMaxBytes : size > g.maxBytes || lines > g.maxLines;
  if (!big) return null;

  const key = `read-guard-${sessionKey(input.session_id)}`;
  /** @type {Record<string, number>} */
  const seen = readState(key) || {};
  for (const [p, t] of Object.entries(seen)) if (now - t > g.retryWindowMin * 60000) delete seen[p];
  if (seen[file]) {
    delete seen[file];
    writeState(key, seen);
    return null;
  }
  seen[file] = now;
  writeState(key, seen);

  const kb = Math.round(size / 1024);
  const tokens = Math.round(size / 3.5 / 1000);
  const what = generated ? `${basename(file)} is generated (lockfile/minified), ${kb} KB` : `${basename(file)} has ${lines} lines (${kb} KB)`;
  recordStat({ kind: 'read-guard', profile: generated ? 'generated' : 'large', cmd: file, inChars: size, outChars: 0 });
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `token-kit: ${what}. Reading it whole puts ~${tokens}k tokens in context, and they stay there until the session ends. ` +
        'Use Grep to find the section and Read with offset/limit. If you really need the whole file, repeat the same call: the second one goes through.',
    },
  };
}

if (isMain(import.meta.url)) run(() => decide(readInput()));
