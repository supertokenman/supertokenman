import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitTopLevel, wrapCommand } from '../lib/shell.mjs';
import { profileFor } from '../lib/profiles.mjs';

const CONDENSE = `node ${join(import.meta.dirname, '..', 'bin', 'tk-condense.mjs')}`;
const choose = (seg) => profileFor(seg.text)?.name ?? null;

test('splits on top-level separators and respects quotes and $()', () => {
  const s = splitTopLevel(`cd a && npm test -- -t "x && y" || echo $(date; true); ls | wc -l`);
  assert.deepEqual(
    s.map((x) => [x.text, x.after]),
    [
      ['cd a', '&&'],
      ['npm test -- -t "x && y"', '||'],
      ['echo $(date; true)', ';'],
      ['ls', '|'],
      ['wc -l', ''],
    ],
  );
});

test('2>&1 and &> are not separators', () => {
  const s = splitTopLevel('npm test 2>&1 && make &> out.log');
  assert.deepEqual(s.map((x) => x.text), ['npm test 2>&1', 'make &> out.log']);
  assert.equal(s[0].plain, false);
});

test('heredoc and multiple lines: left alone', () => {
  assert.equal(splitTopLevel('cat <<EOF\nx\nEOF'), null);
  assert.equal(splitTopLevel('npm test\nnpm run build'), null);
  assert.equal(wrapCommand('npm test\nls', choose, CONDENSE), null);
});

test('wraps only the noisy segment and keeps cd in the main shell', () => {
  const w = wrapCommand('cd engine && npm test', choose, CONDENSE);
  assert.equal(w.command, `set -o pipefail; cd engine && npm test 2>&1 | ${CONDENSE} --profile test`);
});

test('npm test 2>&1 is wrapped too', () => {
  const w = wrapCommand('npm test 2>&1', choose, CONDENSE);
  assert.equal(w.command, `set -o pipefail; npm test 2>&1 | ${CONDENSE} --profile test`);
});

test('does not wrap pipelines, redirections, background or unknown commands', () => {
  assert.equal(wrapCommand('npm test | tail -5', choose, CONDENSE), null);
  assert.equal(wrapCommand('npm test > out.txt', choose, CONDENSE), null);
  assert.equal(wrapCommand('npm test &', choose, CONDENSE), null);
  assert.equal(wrapCommand('ls -la', choose, CONDENSE), null);
  assert.equal(wrapCommand('npm run dev', choose, CONDENSE), null);
  assert.equal(wrapCommand('wrangler dev', choose, CONDENSE), null);
});

test('profiles recognize everyday commands', () => {
  const cases = {
    'npm test': 'test',
    'npm run test:unit': 'test',
    'npx vitest run': 'test',
    'python3 -m pytest -q': 'test',
    'CI=1 npm test': 'test',
    'npm run typecheck': 'typecheck',
    'npx tsc --noEmit': 'typecheck',
    'npm install': 'install',
    'npm ci': 'install',
    'pip install -r requirements.txt': 'install',
    'playwright install chromium': 'install',
    'npx wrangler deploy': 'wrangler',
    'docker build .': 'docker',
    'ffmpeg -i a.mp4 b.mp4': 'media',
  };
  for (const [cmd, name] of Object.entries(cases)) assert.equal(profileFor(cmd)?.name, name, cmd);
  for (const cmd of ['git status', 'ls', 'cat x', 'npm run dev', 'npm start']) assert.equal(profileFor(cmd), null, cmd);
});

test('integration: in bash, the exit code and cd survive the wrapper', () => {
  const home = mkdtempSync(join(tmpdir(), 'tk-shell-'));
  const work = join(home, 'proj');
  mkdirSync(join(work, 'engine'), { recursive: true });
  // fake "npm" that prints 300 lines and fails
  const bin = join(home, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'npm'),
    '#!/usr/bin/env bash\nfor i in $(seq 1 300); do echo "\u2713 case $i passed"; done\necho "FAIL src/x.test.ts > sum"\necho "AssertionError: expected 3 to be 4"\necho "Tests: 1 failed, 300 passed"\nexit 1\n',
    { mode: 0o755 },
  );
  const w = wrapCommand('cd engine && npm test', choose, CONDENSE);
  const script = `cd ${work}; ${w.command}; code=$?; echo "EXIT=$code"; echo "PWD=$(pwd)"`;
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TOKEN_KIT_HOME: home } });
  assert.match(r.stdout, /EXIT=1/);
  assert.match(r.stdout, new RegExp(`PWD=${join(work, 'engine')}`));
  assert.match(r.stdout, /FAIL src\/x\.test\.ts/);
  assert.match(r.stdout, /AssertionError/);
  assert.match(r.stdout, /Tests: 1 failed/);
  assert.match(r.stdout, /\[token-kit\] condensed output \(profile test\)/);
  assert.ok(r.stdout.split('\n').length < 40, `output should be short, got ${r.stdout.split('\n').length} lines`);
  const logs = readdirSync(join(home, 'logs'));
  assert.equal(logs.length, 1);
});
