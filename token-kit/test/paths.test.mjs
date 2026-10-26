// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stableNode } from '../lib/paths.mjs';

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
