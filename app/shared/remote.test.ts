import { describe, expect, it } from 'vitest'
import { checkRemoteDir, localPortFor, remoteDrop, remoteEnv, remoteGit, remoteMerge, remoteScript, remoteShellArgs, remoteWorktree, shq, sshArgs } from './remote'

describe('remote panels', () => {
  it('quotes for the shell', () => {
    expect(shq('--model')).toBe('--model')
    expect(shq(`it's {"a":1}`)).toBe(`'it'\\''s {"a":1}'`)
  })
  it('sends no credentials', () => {
    expect(remoteEnv({ ANTHROPIC_API_KEY: 'sk', GITHUB_TOKEN: 'x', CLAUDE_CODE_ENTRYPOINT: 'sdk-ts', PATH: '/bin', HOME: '/Users/me', CLAUDE_CODE_DISABLE_TELEMETRY: '1' })).toEqual({ CLAUDE_CODE_ENTRYPOINT: 'sdk-ts', CLAUDE_CODE_DISABLE_TELEMETRY: '1' })
  })
  it('builds the remote command', () => {
    expect(remoteScript('~/code/app', ['/local/cli.js', '--output-format', 'stream-json', '--mcp-config', '{"mcpServers":{}}'], { CLAUDE_CODE_ENTRYPOINT: 'sdk-ts', ANTHROPIC_API_KEY: 'no' })).toBe(`cd "$HOME"/code/app && exec env CLAUDE_CODE_ENTRYPOINT=sdk-ts claude --output-format stream-json --mcp-config '{"mcpServers":{}}'`)
    expect(remoteScript('/srv/x', ['-p'], {})).toBe('cd /srv/x && exec claude -p')
  })
  it('checks hosts and folders', () => {
    expect(() => sshArgs('a;rm -rf /', 'x')).toThrow()
    expect(sshArgs('box', 'ls').slice(-2)).toEqual(['box', 'ls'])
    expect(checkRemoteDir('~/code/app')).toBeNull()
    expect(checkRemoteDir('/srv/$(id)')).toMatch(/folder/)
    expect(checkRemoteDir('~/a/../b')).toMatch(/\.\./)
    expect(remoteWorktree('~/code/app', 'panel-1').script).toBe('mkdir -p "$HOME"/.stm-worktrees && git -C "$HOME"/code/app worktree add -b stm/panel-1 "$HOME"/.stm-worktrees/panel-1 HEAD')
  })
})

describe('remote panels, the rest of the panel', () => {
  it('runs git, a shell and the worktree steps in the remote folder, quoted', () => {
    expect(remoteGit('~/code/shop', ['status', '--porcelain=v2', '-z'])).toBe('cd "$HOME"/code/shop && git status --porcelain=v2 -z')
    expect(remoteGit('/srv/a b', ['commit', '-m', "it's done"])).toBe(`cd '/srv/a b' && git commit -m 'it'\\''s done'`)
    expect(remoteShellArgs('box', '~/code/shop').slice(-2)).toEqual(['box', 'cd "$HOME"/code/shop && exec "${SHELL:-/bin/sh}" -l'])
    expect(() => remoteShellArgs('box; rm -rf /', '/x')).toThrow()
    expect(remoteMerge('~/code/shop', '~/.stm-worktrees/shop-1', 'stm/shop-1')).toContain('merge --no-ff --no-edit stm/shop-1')
    expect(remoteDrop('~/code/shop', '~/.stm-worktrees/shop-1', 'stm/shop-1')).toContain('branch -D stm/shop-1')
    expect(localPortFor(5173, [5173])).toBe(5174)
    expect(localPortFor(80, [])).toBe(20080)
  })
})
