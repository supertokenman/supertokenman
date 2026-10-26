import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNote, recall, initVault, notePath } from '../lib/vault.mjs';
import { writeNote } from '../hooks/session-note.mjs';
import { DEFAULTS } from '../lib/config.mjs';

const TK = join(import.meta.dirname, '..', 'bin', 'tk.mjs');
const TEMPLATES = join(import.meta.dirname, '..', 'templates', 'vault');
const usage = { input_tokens: 0, cache_creation_input_tokens: 10000, cache_read_input_tokens: 0, output_tokens: 1000 };
const transcript = (root) => [
  { type: 'user', timestamp: '2026-10-22T10:00:00Z', message: { content: 'Fix the R2 public URL in the publisher' } },
  { type: 'user', isMeta: true, message: { content: '<system-reminder>ignore me</system-reminder>' } },
  { type: 'assistant', timestamp: '2026-10-22T10:01:00Z', message: { id: 'a', model: 'claude-opus-5-5', usage, content: [
    { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: join(root, 'engine/src/publish.ts') } },
    { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'cd engine && npm test' } },
  ] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
  { type: 'assistant', timestamp: '2026-10-22T10:02:00Z', message: { id: 'a', model: 'claude-opus-5-5', usage, content: [{ type: 'text', text: 'Done: the publisher now uses media.example.com.' }] } },
];

test('session note: prompts, relative files, commands, cost and last answer, without system noise', () => {
  const note = buildNote(transcript('/repo'), { session: 'abcdef123456', project: 'bzcorrida', rate: 5, currency: 'BRL', root: '/repo' });
  assert.match(note, /^---\nproject: bzcorrida\nsession: abcdef123456\ndate: 2026-10-22/);
  assert.match(note, /# Fix the R2 public URL in the publisher/);
  assert.doesNotMatch(note, /ignore me/);
  assert.match(note, /- `engine\/src\/publish\.ts`/);
  assert.match(note, /- `cd engine && npm test`/);
  // one request counted once: 10k at the 1h write price ($8/MTok) + 1k output ($20/MTok) = $0.10
  assert.match(note, /api_value_usd: 0\.10/);
  assert.match(note, /R\$0\.50/);
  assert.match(note, /> Done: the publisher now uses media\.example\.com\./);
});

test('init never overwrites, recall ranks rules and projects before sessions', () => {
  const v = mkdtempSync(join(tmpdir(), 'tk-vault-'));
  assert.ok(initVault(v, TEMPLATES, ['bzcorrida']).includes(join('projects', 'bzcorrida.md')));
  writeFileSync(join(v, 'projects', 'bzcorrida.md'), '# bzcorrida\n\nDecision: R2 custom domain media.example.com\n');
  assert.equal(initVault(v, TEMPLATES, ['bzcorrida']).length, 0);
  assert.match(readFileSync(join(v, 'projects', 'bzcorrida.md'), 'utf8'), /custom domain/);
  mkdirSync(join(v, 'sessions', 'bzcorrida'), { recursive: true });
  writeFileSync(join(v, 'sessions', 'bzcorrida', '2026-10-20-aaaa.md'), 'old: R2 domain was r2.dev\n');
  writeFileSync(join(v, 'sessions', 'bzcorrida', '2026-10-22-bbbb.md'), 'new: R2 domain switched\n');
  utimesSync(join(v, 'sessions', 'bzcorrida', '2026-10-20-aaaa.md'), new Date('2026-10-20'), new Date('2026-10-20'));
  const hits = recall(v, 'r2 domain');
  assert.match(hits[0], /^projects\/bzcorrida\.md:3:/);
  assert.match(hits[1], /2026-10-22-bbbb/);
  assert.match(hits[2], /2026-10-20-aaaa/);
  assert.equal(recall(v, 'r2 domain', { project: 'other' }).length, 1);
  assert.equal(recall(v, 'domain', { maxLines: 1 }).at(-1), '… 2 more matches; narrow the query or open the files above');
});

test('hook writes the note into the vault only when a vault is configured', () => {
  const root = mkdtempSync(join(tmpdir(), 'tk-proj-'));
  const t = join(root, 't.jsonl');
  writeFileSync(t, transcript(root).map((e) => JSON.stringify(e)).join('\n'));
  process.env.TOKEN_KIT_HOME = mkdtempSync(join(tmpdir(), 'tk-home-'));
  const input = { session_id: 'abcdef123456', transcript_path: t, cwd: root };
  assert.equal(writeNote(input, structuredClone(DEFAULTS)), null);
  const vault = mkdtempSync(join(tmpdir(), 'tk-v-'));
  const cfg = { ...structuredClone(DEFAULTS), vault: { path: vault } };
  const file = writeNote(input, cfg);
  const project = root.split('/').pop();
  assert.equal(file, notePath(vault, project, '2026-10-22', 'abcdef123456'));
  assert.match(readFileSync(file, 'utf8'), /engine\/src\/publish\.ts/);
});

test('tk vault init + install --claude-md tells Claude where the vault is; tk recall searches it', () => {
  const cfgDir = mkdtempSync(join(tmpdir(), 'tk-vcfg-'));
  const v = join(cfgDir, 'my-vault');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfgDir };
  delete env.TOKEN_KIT_HOME;
  const run = (...a) => spawnSync(process.execPath, [TK, ...a], { encoding: 'utf8', env });
  assert.equal(run('vault', 'init', v, '--projects', 'bzcorrida').status, 0);
  assert.ok(existsSync(join(v, 'projects', 'bzcorrida.md')));
  assert.equal(run('install', '--claude-md').status, 0);
  const md = readFileSync(join(cfgDir, 'CLAUDE.md'), 'utf8');
  assert.match(md, new RegExp(`Memory vault at \`${v.replace(/[/.]/g, '\\$&')}\``));
  assert.match(md, /push them straight to the vault's main branch: no branch, no pull request/);
  const settings = JSON.parse(readFileSync(join(cfgDir, 'settings.json'), 'utf8'));
  assert.ok(settings.hooks.Stop[0].hooks[0].command.includes('session-note.mjs'));
  const r = run('recall', 'next', 'step');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /projects\/bzcorrida\.md:\d+: 1\. The next concrete step\./);
});
