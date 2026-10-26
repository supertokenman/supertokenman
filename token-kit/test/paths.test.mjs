// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { condenseInvocation, stableNode } from '../lib/paths.mjs';

test('stableNode prefers the PATH symlink over a versioned Homebrew Cellar path', () => {
  const root = mkdtempSync(join(tmpdir(), 'tk-node-'));
  const cellar = join(root, 'Cellar', 'node', '25.8.2', 'bin');
  const bin = join(root, 'bin');
  mkdirSync(cellar, { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(cellar, 'node'), '');
  symlinkSync(join(cellar, 'node'), join(bin, 'node'));
  assert.equal(stableNode(join(cellar, 'node'), ['/nowhere', bin].join(':')), join(bin, 'node'));
});

test('stableNode keeps execPath when no PATH entry is the same binary', () => {
  assert.equal(stableNode('/opt/x/bin/node', '/nowhere'), '/opt/x/bin/node');
});

test('condenseInvocation names the real folder, so a symlinked ~/.claude gives the same rule as the hook', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tk-link-')));
  mkdirSync(join(root, 'real', 'bin'), { recursive: true });
  symlinkSync(join(root, 'real'), join(root, 'link'));
  assert.equal(condenseInvocation(join(root, 'link')), `node ${join(root, 'real', 'bin', 'tk-condense.mjs')}`);
  assert.equal(condenseInvocation(join(root, 'missing')), `node ${join(root, 'missing', 'bin', 'tk-condense.mjs')}`);
});
