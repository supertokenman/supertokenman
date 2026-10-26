import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TK = join(import.meta.dirname, '..', 'bin', 'tk.mjs');

test('install -> doctor -> installed hooks respond -> uninstall', () => {
  const cfgDir = mkdtempSync(join(tmpdir(), 'tk-e2e-'));
  writeFileSync(join(cfgDir, 'settings.json'), JSON.stringify({ model: 'opus' }));
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfgDir, TOKEN_KIT_HOME: '' };
  delete env.TOKEN_KIT_HOME;
  const run = (...args) => spawnSync(process.execPath, [TK, ...args], { encoding: 'utf8', env });

  const inst = run('install', '--claude-md');
  assert.equal(inst.status, 0, inst.stderr);
  const kit = join(cfgDir, 'token-kit');
  assert.ok(existsSync(join(kit, 'hooks', 'pre-bash.mjs')));
  assert.ok(existsSync(join(kit, 'config.json')));
  const settings = JSON.parse(readFileSync(join(cfgDir, 'settings.json'), 'utf8'));
  assert.equal(settings.model, 'opus');
  assert.ok(settings.hooks.PreToolUse.some((e) => e.hooks[0].command.includes(join(kit, 'hooks', 'pre-bash.mjs'))));
  assert.match(readFileSync(join(cfgDir, 'CLAUDE.md'), 'utf8'), /token-kit:start/);

  const doc = run('doctor');
  assert.equal(doc.status, 0, doc.stdout + doc.stderr);

  // run the installed hook exactly as settings says
  const pre = settings.hooks.PreToolUse.find((e) => e.matcher === 'Bash').hooks[0].command;
  const r = spawnSync('bash', ['-c', pre], { input: JSON.stringify({ tool_input: { command: 'cd engine && npm test' } }), encoding: 'utf8', env });
  const cmd = JSON.parse(r.stdout).hookSpecificOutput.updatedInput.command;
  assert.ok(cmd.includes(join(kit, 'bin', 'tk-condense.mjs')));
  // the installed allow rule covers the invocation the hook uses
  const rule = settings.permissions.allow.find((x) => x.includes('tk-condense'));
  assert.ok(cmd.includes(rule.slice('Bash('.length, -' *)'.length)));

  // reinstalling does not duplicate
  run('install', '--claude-md');
  const again = JSON.parse(readFileSync(join(cfgDir, 'settings.json'), 'utf8'));
  assert.equal(again.hooks.PreToolUse.length, 2);
  assert.equal((readFileSync(join(cfgDir, 'CLAUDE.md'), 'utf8').match(/token-kit:start/g) || []).length, 1);

  const un = run('uninstall', '--purge');
  assert.equal(un.status, 0, un.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(cfgDir, 'settings.json'), 'utf8')), { model: 'opus' });
  assert.ok(!existsSync(kit));
  assert.doesNotMatch(readFileSync(join(cfgDir, 'CLAUDE.md'), 'utf8'), /token-kit/);
});

test('analyze reads a folder of transcripts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tk-an-'));
  mkdirSync(join(dir, 'proj'));
  const lines = [
    { type: 'user', message: { content: 'hi' } },
    { type: 'assistant', timestamp: '2026-10-01T10:00:00Z', message: { id: 'a', model: 'm', content: [{ type: 'tool_use', id: 't', name: 'Read', input: { file_path: '/x/big.ts' } }], usage: { input_tokens: 5, cache_creation_input_tokens: 40000, cache_read_input_tokens: 0, output_tokens: 50 } } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'y'.repeat(70000) }] } },
    { type: 'assistant', timestamp: '2026-10-01T10:01:00Z', message: { id: 'b', model: 'm', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 5, cache_creation_input_tokens: 20050, cache_read_input_tokens: 40005, output_tokens: 80 } } },
  ];
  writeFileSync(join(dir, 'proj', 's.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n'));
  const r = spawnSync(process.execPath, [TK, 'analyze', '--path', dir, '--days', '3650'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Read: \.ts/);
  assert.match(r.stdout, /\/x\/big\.ts/);
  const j = JSON.parse(spawnSync(process.execPath, [TK, 'analyze', '--path', dir, '--days', '3650', '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(j.requests, 2);
});

test('cloud-script: the self-contained setup script installs the kit in a clean HOME', () => {
  const home = mkdtempSync(join(tmpdir(), 'tk-cloud-'));
  const script = spawnSync(process.execPath, [TK, 'cloud-script', '--no-rtk'], { encoding: 'utf8' }).stdout;
  assert.match(script, /^#!\/bin\/bash/);
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.TOKEN_KIT_HOME;
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(home, '.claude', 'token-kit', 'hooks', 'pre-bash.mjs')), r.stdout + r.stderr);
  const s = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
  assert.ok(s.hooks.PostToolUse[0].hooks[0].command.includes(join(home, '.claude', 'token-kit')));
  assert.match(readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8'), /token-kit:start/);
});

test('cloud-script with a preset and economical defaults', () => {
  const home = mkdtempSync(join(tmpdir(), 'tk-cloud2-'));
  const preset = join(import.meta.dirname, '..', 'presets', 'bzcorrida.json');
  const script = spawnSync(process.execPath, [TK, 'cloud-script', '--no-rtk', '--claude-md', '--effort', 'low', '--subagent-model', 'sonnet', '--config', preset], { encoding: 'utf8' }).stdout;
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.TOKEN_KIT_HOME;
  const run = () => spawnSync('bash', ['-c', script], { encoding: 'utf8', env });
  assert.equal(run().status, 0);
  assert.equal(run().status, 0); // running again (cache rebuilt) duplicates nothing
  const s = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
  assert.equal(s.effortLevel, 'low');
  assert.equal(s.env.CLAUDE_CODE_SUBAGENT_MODEL, 'sonnet');
  assert.equal(s.hooks.PreToolUse.length, 2);
  const cfg = JSON.parse(readFileSync(join(home, '.claude', 'token-kit', 'config.json'), 'utf8'));
  assert.deepEqual(cfg.profiles.map((p) => p.name), ['bz-studio', 'bz-studio-render']);
  assert.equal(cfg.condense.maxLines, 60); // defaults are still there
});

test('install replaces the Portuguese block written by earlier versions', () => {
  const cfgDir = mkdtempSync(join(tmpdir(), 'tk-md-'));
  writeFileSync(join(cfgDir, 'CLAUDE.md'), '# mine\n\n<!-- token-kit:inicio -->\nold rules\n<!-- token-kit:fim -->\n');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfgDir };
  delete env.TOKEN_KIT_HOME;
  assert.equal(spawnSync(process.execPath, [TK, 'install', '--claude-md'], { encoding: 'utf8', env }).status, 0);
  const md = readFileSync(join(cfgDir, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(md, /inicio|old rules/);
  assert.equal((md.match(/token-kit:start/g) || []).length, 1);
  assert.match(md, /^# mine/);
  assert.equal(spawnSync(process.execPath, [TK, 'uninstall'], { encoding: 'utf8', env }).status, 0);
  assert.doesNotMatch(readFileSync(join(cfgDir, 'CLAUDE.md'), 'utf8'), /token-kit/);
});
