import { describe, expect, it } from 'vitest'
import { keepFor, qualified, savings, type ToolInfo } from './toolprune'

const gh = ['create_issue Create a new issue in a repository', 'list_pull_requests List pull requests', 'merge_pull_request Merge a pull request', 'get_file_contents Read a file from a repository', 'search_code Search code']
const tools: ToolInfo[] = [
  ...gh.map((d) => ({ server: 'github', name: d.split(' ')[0]!, description: d.split(' ').slice(1).join(' '), tokens: 300 })),
  ...Array.from({ length: 40 }, (_, i) => ({ server: 'misc', name: `tool_${i}`, description: `does unrelated thing number ${i} with spreadsheets`, tokens: 200 })),
  { server: 'postgres', name: 'query', description: 'Run a read-only SQL query on the database', tokens: 250 },
  { server: 'mem', name: 'memory_index', description: 'The project memory index', tokens: 150 },
]

describe('tool pruning', () => {
  it('keeps tools that match the task, the app memory, and drops the rest', () => {
    const keep = keepFor('review the open pull requests and merge the green one', tools)
    expect(keep.has('mcp__github__list_pull_requests')).toBe(true)
    expect(keep.has('mcp__github__merge_pull_request')).toBe(true)
    expect(keep.has('mcp__mem__memory_index')).toBe(true)
    expect(keep.has('mcp__misc__tool_3')).toBe(false)
    const s = savings(tools, keep)
    expect(s.off.length).toBeGreaterThan(38)
    expect(s.tokens).toBeGreaterThan(8000)
  })
  it('keeps a whole server the task names', () => {
    const keep = keepFor('use postgres to count orders', tools)
    expect(keep.has('mcp__postgres__query')).toBe(true)
  })
  it('never keeps more than the cap', () => {
    const keep = keepFor('spreadsheets thing', tools, { max: 5 })
    expect([...keep].filter((q) => q.startsWith('mcp__misc__')).length).toBe(5)
    expect(qualified({ server: 'a', name: 'b' })).toBe('mcp__a__b')
  })
})
