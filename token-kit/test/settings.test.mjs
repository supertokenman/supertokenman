import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyKit, removeKit } from '../lib/settings.mjs';

const user = {
  model: 'opus',
  permissions: { allow: ['Bash(npm test)'] },
  hooks: { Stop: [{ hooks: [{ type: 'command', command: '~/.claude/stop.sh' }] }] },
  statusLine: { type: 'command', command: '~/.claude/my-status.sh' },
};

test('applies hooks and rules without removing what the user had', () => {
  const { settings, notes } = applyKit(user, { kitDir: '/h/.claude/token-kit' });
  assert.equal(settings.model, 'opus');
  assert.deepEqual(settings.hooks.Stop[0], user.hooks.Stop[0]);
  assert.match(settings.hooks.Stop[1].hooks[0].command, /session-note\.mjs/);
  assert.equal(settings.hooks.Stop[1].hooks[0].async, true);
  assert.equal(settings.hooks.PreToolUse.length, 2);
  assert.equal(settings.hooks.PostToolUse[0].matcher, 'Bash');
  assert.ok(settings.permissions.allow.includes('Bash(npm test)'));
  assert.ok(settings.permissions.allow.includes('Bash(set -o pipefail)'));
  assert.equal(settings.statusLine.command, '~/.claude/my-status.sh');
  assert.match(notes.join(' '), /already have a statusline/);
});

test('is idempotent and remove restores the original', () => {
  const once = applyKit(user, { kitDir: '/h/.claude/token-kit' }).settings;
  const twice = applyKit(once, { kitDir: '/h/.claude/token-kit' }).settings;
  assert.deepEqual(twice, once);
  assert.deepEqual(removeKit(twice), user);
});

test('the kit statusline is added when there is none and removed on uninstall', () => {
  const { settings } = applyKit({}, { kitDir: '/h/.claude/token-kit' });
  assert.match(settings.statusLine.command, /token-kit\/statusline\/statusline\.mjs/);
  assert.deepEqual(removeKit(settings), {});
});

test('detects the RTK hook and removes it when asked', () => {
  const withRtk = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '~/.claude/hooks/rtk-rewrite.sh' }] }] } };
  assert.match(applyKit(withRtk, { kitDir: '/k/token-kit' }).notes.join(' '), /RTK hook/);
  const replaced = applyKit(withRtk, { kitDir: '/k/token-kit', replaceRtkHook: true }).settings;
  assert.ok(!JSON.stringify(replaced).includes('rtk-rewrite'));
});

test('subagent model, effort and Bash limit options', () => {
  const { settings } = applyKit({}, { kitDir: '/k/token-kit', subagentModel: 'sonnet', effort: 'low', bashMaxChars: 20000, statusline: false });
  assert.equal(settings.env.CLAUDE_CODE_SUBAGENT_MODEL, 'sonnet');
  assert.equal(settings.effortLevel, 'low');
  assert.equal(settings.bashOutputMaxChars, 20000);
  assert.equal(settings.statusLine, undefined);
});
