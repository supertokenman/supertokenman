import { describe, expect, it } from 'vitest'
import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk'
import { toOverhead } from './overhead'

const usage = {
  model: 'claude-haiku-4-5',
  categories: [
    { id: 'system_prompt', name: 'System prompt', tokens: 3000, color: '', kind: 'used' },
    { id: 'system_tools', name: 'System tools', tokens: 12000, color: '', kind: 'used' },
    { id: 'mcp_tools', name: 'MCP tools', tokens: 5000, color: '', kind: 'used' },
    { id: 'memory_files', name: 'Memory files', tokens: 800, color: '', kind: 'used' },
    { id: 'messages', name: 'Messages', tokens: 40000, color: '', kind: 'used' },
    { id: 'mcp_tools_deferred', name: 'MCP tools (deferred)', tokens: 9000, color: '', kind: 'deferred' },
    { id: 'free_space', name: 'Free space', tokens: 100000, color: '', kind: 'free' },
    { id: 'autocompact_buffer', name: 'Buffer', tokens: 30000, color: '', kind: 'buffer' },
  ],
  mcpTools: [
    { name: 'a', serverName: 'github', tokens: 3000 },
    { name: 'b', serverName: 'github', tokens: 1000 },
    { name: 'c', serverName: 'symbols', tokens: 1000 },
    { name: 'd', serverName: 'figma', tokens: 9000, isLoaded: false },
  ],
  memoryFiles: [{ path: '/p/CLAUDE.md', type: 'Project', tokens: 800 }],
} as unknown as SDKControlGetContextUsageResponse

describe('toOverhead', () => {
  it('keeps what every turn pays, ranks it, and groups tools by server', () => {
    const o = toOverhead(usage)
    expect(o.fixed).toBe(20800)
    expect(o.rows.map((r) => r.id)).toEqual(['system_tools', 'mcp_tools', 'system_prompt', 'memory_files'])
    expect(o.servers).toEqual([{ name: 'github', tokens: 4000, tools: 2, onDemand: false }, { name: 'symbols', tokens: 1000, tools: 1, onDemand: false }, { name: 'figma', tokens: 9000, tools: 1, onDemand: true }])
    expect(o.deferred).toBe(9000)
    expect(o.memory).toEqual([{ path: '/p/CLAUDE.md', tokens: 800 }])
  })
})
