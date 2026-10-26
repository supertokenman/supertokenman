import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS } from '../lib/config.mjs';
import { writeState } from '../lib/store.mjs';
import { decide as preBash } from '../hooks/pre-bash.mjs';
import { decide as postBash } from '../hooks/post-bash.mjs';
import { decide as readGuard } from '../hooks/read-guard.mjs';
import { decide as nudge } from '../hooks/prompt-nudge.mjs';
import { render } from '../statusline/statusline.mjs';

const cfg = structuredClone(DEFAULTS);
const noRtk = () => null;
let home;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'tk-hooks-'));
  process.env.TOKEN_KIT_HOME = home;
});

test('pre-bash: wraps tests and keeps the other input fields', () => {
  const out = preBash({ tool_input: { command: 'npm test', description: 'run tests', timeout: 60000 } }, cfg, noRtk);
  const ui = out.hookSpecificOutput.updatedInput;
  assert.match(ui.command, /npm test 2>&1 \| node .*tk-condense\.mjs --profile test$/);
  assert.equal(ui.description, 'run tests');
  assert.equal(ui.timeout, 60000);
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
});

test('pre-bash: leaves background, # tk:raw, rtk and unknown commands alone', () => {
  assert.equal(preBash({ tool_input: { command: 'npm test', run_in_background: true } }, cfg, noRtk), null);
  assert.equal(preBash({ tool_input: { command: 'npm test # tk:raw' } }, cfg, noRtk), null);
  assert.equal(preBash({ tool_input: { command: 'rtk git status' } }, cfg, noRtk), null);
  assert.equal(preBash({ tool_input: { command: 'git status' } }, cfg, noRtk), null);
});

test('pre-bash: uses RTK and passes its allow on only when nothing else was wrapped', () => {
  const rtk = (c) => (c === 'git status' ? { command: 'rtk git status', allow: true } : null);
  const a = preBash({ tool_input: { command: 'git status' } }, cfg, rtk);
  assert.equal(a.hookSpecificOutput.updatedInput.command, 'rtk git status');
  assert.equal(a.hookSpecificOutput.permissionDecision, 'allow');

  const rtk2 = () => ({ command: 'rtk git status && npm test', allow: true });
  const b = preBash({ tool_input: { command: 'git status && npm test' } }, cfg, rtk2);
  assert.match(b.hookSpecificOutput.updatedInput.command, /^set -o pipefail; rtk git status && npm test 2>&1 \| /);
  assert.equal(b.hookSpecificOutput.permissionDecision, undefined);
});

test('pre-bash: git diff/show skip RTK (every line matters)', () => {
  const rtk = (c) => ({ command: `rtk ${c}`, allow: false });
  assert.equal(preBash({ tool_input: { command: 'git diff' } }, cfg, rtk), null);
  assert.equal(preBash({ tool_input: { command: 'cd engine && git show HEAD' } }, cfg, rtk), null);
  assert.equal(preBash({ tool_input: { command: 'git status' } }, cfg, rtk).hookSpecificOutput.updatedInput.command, 'rtk git status');
});

test('pre-bash: rtk.mode off ignores RTK', () => {
  const off = { ...cfg, rtk: { mode: 'off' } };
  assert.equal(preBash({ tool_input: { command: 'git status' } }, off, () => ({ command: 'rtk git status', allow: true })), null);
});

const big = Array.from({ length: 3000 }, (_, i) => `file-${i}.ts`).join('\n');

test('post-bash: condenses large output, saves the full output and keeps the shape', () => {
  let saved = '';
  const out = postBash(
    { tool_input: { command: 'find . -name "*.ts"' }, tool_response: { stdout: big, stderr: '', interrupted: false, isImage: false, extra: 1 } },
    cfg,
    (t) => ((saved = t), '/tmp/log.log'),
  );
  const r = out.hookSpecificOutput.updatedToolOutput;
  assert.equal(saved, big);
  assert.equal(r.interrupted, false);
  assert.equal(r.isImage, false);
  assert.equal(r.extra, 1);
  assert.match(r.stdout, /Full output: \/tmp\/log\.log/);
  assert.ok(r.stdout.length < big.length / 10);
});

test('post-bash: leaves small output, content (cat, git diff) and unsavable output alone', () => {
  const res = { stdout: big, stderr: '', interrupted: false, isImage: false };
  assert.equal(postBash({ tool_input: { command: 'ls' }, tool_response: { ...res, stdout: 'a\nb' } }, cfg), null);
  assert.equal(postBash({ tool_input: { command: 'cat src/a.ts' }, tool_response: res }, cfg), null);
  assert.equal(postBash({ tool_input: { command: 'cd x && git diff' }, tool_response: res }, cfg), null);
  assert.equal(
    postBash({ tool_input: { command: 'find .' }, tool_response: res }, cfg, () => {
      throw new Error('disk full');
    }),
    null,
  );
});

test('read-guard: blocks the first full read of a large file, allows the second', () => {
  const f = join(home, 'large.ts');
  writeFileSync(f, Array.from({ length: 2000 }, (_, i) => `const x${i} = ${i};`).join('\n'));
  const input = { session_id: 's1', tool_input: { file_path: f } };
  const first = readGuard(input, cfg, 1000);
  assert.equal(first.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(first.hookSpecificOutput.permissionDecisionReason, /2000 lines|1999 lines/);
  assert.equal(readGuard(input, cfg, 2000), null);
  // past the window: blocks again
  assert.equal(readGuard(input, cfg, 3000).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(readGuard(input, cfg, 3000 + 16 * 60000).hookSpecificOutput.permissionDecision, 'deny');
});

test('read-guard: allows small files, offset/limit reads and images', () => {
  const small = join(home, 's.ts');
  writeFileSync(small, 'const a = 1;\n');
  const bigf = join(home, 'g.ts');
  writeFileSync(bigf, 'x\n'.repeat(5000));
  assert.equal(readGuard({ tool_input: { file_path: small } }, cfg), null);
  assert.equal(readGuard({ tool_input: { file_path: bigf, offset: 1, limit: 50 } }, cfg), null);
  assert.equal(readGuard({ tool_input: { file_path: join(home, 'a.png') } }, cfg), null);
});

test('read-guard: lockfiles have a lower limit', () => {
  const lock = join(home, 'package-lock.json');
  writeFileSync(lock, '{"a":1}\n'.repeat(4000));
  assert.match(readGuard({ session_id: 'x', tool_input: { file_path: lock } }, cfg).hookSpecificOutput.permissionDecisionReason, /generated/);
});

test('nudge: warns once per context step, and again after compacting', () => {
  const now = Date.now();
  const snap = (tokens) => writeState('ctx-s2', { tokens, pct: null, window: 200000, cacheExpiresAt: now + 600000, fiveHour: null, sevenDay: null, at: now });
  snap(130000);
  assert.match(nudge({ session_id: 's2' }, cfg, now).systemMessage, /65% of the window/);
  assert.equal(nudge({ session_id: 's2' }, cfg, now), null);
  snap(175000);
  assert.match(nudge({ session_id: 's2' }, cfg, now).systemMessage, /\/compact now/);
  snap(20000);
  assert.equal(nudge({ session_id: 's2' }, cfg, now), null);
  snap(125000);
  assert.match(nudge({ session_id: 's2' }, cfg, now).systemMessage, /63% of the window/);
});

test('nudge: expired cache and the 5h window', () => {
  const now = Date.now();
  writeState('ctx-s3', { tokens: 90000, pct: null, window: 1000000, cacheExpiresAt: now - 1000, fiveHour: { pct: 85, resetsAt: now + 3600000 }, sevenDay: null, at: now - 70 * 60000 });
  const m = nudge({ session_id: 's3' }, cfg, now).systemMessage;
  assert.match(m, /Cache expired/);
  assert.match(m, /85% of the 5h window/);
  assert.equal(nudge({ session_id: 's3' }, cfg, now), null);
});

test('nudge: without a statusline, uses the transcript', () => {
  const t = join(home, 't.jsonl');
  const lastAt = Date.now() - 90 * 60000;
  writeFileSync(
    t,
    JSON.stringify({ type: 'assistant', timestamp: new Date(lastAt).toISOString(), message: { usage: { input_tokens: 2, cache_read_input_tokens: 130000, cache_creation_input_tokens: 500 } } }) + '\n',
  );
  const m = nudge({ session_id: 's4', transcript_path: t }, cfg).systemMessage;
  assert.match(m, /Context at 131k tokens/);
  assert.match(m, /idle for 90 min/);
});

test('statusline: shows context, windows, cache and saves the snapshot', () => {
  process.env.NO_COLOR = '1';
  const now = Date.now();
  const line = render(
    {
      session_id: 's5',
      model: { display_name: 'Opus' },
      effort: { level: 'low' },
      context_window: { total_input_tokens: 84000, context_window_size: 1000000, used_percentage: 8 },
      rate_limits: { five_hour: { used_percentage: 23.5, resets_at: Math.floor(now / 1000) + 3600 }, seven_day: { used_percentage: 41 } },
      prompt_cache: { expires_at: Math.floor(now / 1000) + 1800 },
    },
    now,
    12000,
  );
  assert.match(line, /Opus/);
  assert.match(line, /low/);
  assert.match(line, /ctx 8% 84k/);
  assert.match(line, /5h 24%/);
  assert.match(line, /7d 41%/);
  assert.match(line, /cache 30min/);
  assert.match(line, /kit -12k today/);
});

test('pre-bash: passes the session id to the condenser (menu bar stats)', () => {
  const out = preBash({ session_id: 'abc-123', tool_input: { command: 'npm test' } }, cfg, noRtk);
  assert.match(out.hookSpecificOutput.updatedInput.command, /--profile test --session abc-123$/);
  const weird = preBash({ session_id: 'x; rm -rf /', tool_input: { command: 'npm test' } }, cfg, noRtk);
  assert.doesNotMatch(weird.hookSpecificOutput.updatedInput.command, /--session/);
});
