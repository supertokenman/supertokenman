import { test } from 'node:test';
import assert from 'node:assert/strict';
import { condense, clean } from '../lib/condense.mjs';
import { profileByName, GENERIC } from '../lib/profiles.mjs';
import { DEFAULTS } from '../lib/config.mjs';

const opt = DEFAULTS.condense;

test('small output passes through untouched', () => {
  const r = condense('ok\n2 passed\n', profileByName('test'), opt);
  assert.equal(r.changed, false);
  assert.equal(r.text, 'ok\n2 passed\n');
});

test('strips ANSI and \\r rewrites', () => {
  assert.deepEqual(clean('\x1b[32mgreen\x1b[0m\n10%\r50%\r100% done'), ['green', '100% done']);
});

test('failing test: keeps the failure, context, summary and tail; drops passing cases', () => {
  const lines = [];
  for (let i = 0; i < 400; i++) lines.push(` \u2713 case ${i} (2 ms)`);
  lines.push(' FAIL  src/sum.test.ts > sum > two numbers', '   AssertionError: expected 3 to be 4', '   Expected: 4', '   Received: 3', '    \u276F src/sum.test.ts:12:20');
  for (let i = 0; i < 100; i++) lines.push(` \u2713 other ${i} (1 ms)`);
  lines.push(' Test Files  1 failed | 9 passed (10)', '      Tests  1 failed | 499 passed (500)', '   Duration  2.31s');
  const r = condense(lines.join('\n'), profileByName('test'), opt);
  assert.equal(r.changed, true);
  for (const must of ['FAIL  src/sum.test.ts', 'AssertionError', 'Expected: 4', 'Received: 3', 'src/sum.test.ts:12:20', 'Tests  1 failed', 'Duration']) assert.ok(r.text.includes(must), must);
  assert.ok(!r.text.includes('case 200'), 'passing cases should be gone');
  assert.ok(r.outLines < 30, `ended with ${r.outLines} lines`);
});

test('generic: head, tail, errors with context and a cut marker', () => {
  const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
  lines[500] = 'Error: connection refused';
  const r = condense(lines.join('\n'), GENERIC, opt);
  assert.ok(r.text.includes('line 0'));
  assert.ok(r.text.includes('line 999'));
  assert.ok(r.text.includes('line 499') && r.text.includes('Error: connection refused') && r.text.includes('line 501'));
  assert.match(r.text, /lines omitted/);
  assert.ok(r.outLines < 60);
});

test('repeated lines become one with a counter', () => {
  const raw = Array.from({ length: 200 }, () => 'npm WARN the same thing').join('\n');
  const r = condense(raw, GENERIC, opt);
  assert.match(r.text, /repeated 200x/);
  assert.equal(r.outLines, 1);
});

test('many error blocks: keeps the first ones and the last, and says so', () => {
  const lines = [];
  for (let i = 0; i < 60; i++) lines.push(`ok ${i}`, `ok ${i}b`, `ok ${i}c`, `ok ${i}d`, `ok ${i}e`, `ok ${i}f`, `error TS2322 in file ${i}`);
  const r = condense(lines.join('\n'), GENERIC, opt);
  assert.match(r.text, /error block\(s\) omitted/);
  assert.ok(r.text.includes('error TS2322 in file 0'));
  assert.ok(r.text.includes('error TS2322 in file 59'));
});

test('install: drops download noise and keeps the summary', () => {
  const lines = [];
  for (let i = 0; i < 200; i++) lines.push(`npm warn deprecated package${i}@1.0.0: do not use`.replace('warn', 'WARN'));
  for (let i = 0; i < 100; i++) lines.push(`Collecting lib${i}`);
  lines.push('added 812 packages, and audited 813 packages in 14s', 'found 0 vulnerabilities');
  const r = condense(lines.join('\n'), profileByName('install'), opt);
  assert.ok(r.text.includes('added 812 packages'));
  assert.ok(r.text.includes('found 0 vulnerabilities'));
  assert.ok(r.outLines <= 5, r.text);
});

test('Bia & Ze preset: matches the studio scripts and keeps failures and generated files', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { profileFor } = await import('../lib/profiles.mjs');
  const preset = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'presets', 'bzcorrida.json'), 'utf8'));
  for (const c of ['python3 bz/gerar.py bz/roteiros/p04_gel_quando.json out/pautas', 'python3 bz/validate.py', 'python3 studio/bz/t_compose_assets.py'])
    assert.equal(profileFor(c, preset.profiles)?.name, 'bz-studio', c);
  assert.equal(profileFor('python3 render.py', preset.profiles)?.name, 'bz-studio-render');
  assert.equal(profileFor('python3 -m http.server', preset.profiles), null);

  const lines = [];
  // the studio scripts print in Portuguese (FALHA, casos, falhas); the profile matches that output
  for (let i = 0; i < 300; i++) lines.push(`ok caso ${i} diferença 0.000%`);
  lines.push('FALHA bia corrida frente passada_3 0.412');
  lines.push('casos 301 falhas 1 | maior diferença 0.412%');
  lines.push('out/pautas/p04_gel_quando.mp4', 'out/pautas/p04_gel_quando_legenda.txt');
  const { profileByName } = await import('../lib/profiles.mjs');
  const r = condense(lines.join('\n'), profileByName('bz-studio', preset.profiles), opt);
  for (const must of ['FALHA bia corrida', 'casos 301 falhas 1', 'p04_gel_quando.mp4', '_legenda.txt']) assert.ok(r.text.includes(must), must);
  assert.ok(r.outLines < 30);
});
