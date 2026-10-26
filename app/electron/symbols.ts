// The code index (Token Savior, MIT): a local MCP server the panels ask for a symbol's place, one
// function's source or its callers, instead of reading whole files. It runs per panel on this Mac,
// indexes the panel's folder only, and keeps its data in the app's folder. Its one file inside the
// project, the index cache, is kept out of git through the repository's local exclude list.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'

let dir = ''
let data = ''
export const setSymbolsDir = (d: string, dataDir: string) => ((dir = d), (data = dataDir))
export const symbolsDir = () => dir
const bin = () => join(dir, '.venv', 'bin', 'token-savior')
export const symbolsReady = () => Boolean(dir) && existsSync(bin())

export const CACHE_FILE = '.token-savior-cache.json'
/** Lookups that only read; the two that edit code still ask. */
export const SYMBOL_READS = ['find_symbol', 'get_function_source', 'get_full_context', 'get_call_chain', 'search_codebase', 'ts_search', 'get_entry_points', 'find_dead_code', 'analyze_config', 'detect_breaking_changes', 'find_semantic_duplicates', 'get_git_status'].map((t) => `mcp__symbols__${t}`)

/** Adds the index cache to the repository's own exclude list, once; a folder that is not a repository is left alone. */
export function excludeCache(cwd: string, entry = CACHE_FILE, why = 'the code index of SuperTokenMan') {
  const file = join(cwd, '.git', 'info', 'exclude')
  if (!existsSync(join(cwd, '.git', 'info'))) return false
  const now = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (now.split('\n').some((l) => l.trim() === entry)) return false
  appendFileSync(file, `${now && !now.endsWith('\n') ? '\n' : ''}# ${why}\n${entry}\n`)
  return true
}

/** The server for one panel's folder. */
export function symbolsServer(cwd: string): McpServerConfig {
  return {
    type: 'stdio',
    command: bin(),
    args: [],
    env: {
      WORKSPACE_ROOTS: cwd,
      TOKEN_SAVIOR_PROFILE: 'optimized',
      TOKEN_SAVIOR_CLIENT: 'claude-code',
      // its default stops at 10,000 files without a word, leaving most of a large repository out
      TOKEN_SAVIOR_MAX_FILES: '100000',
      TOKEN_SAVIOR_DATA_DIR: join(data, 'data'),
      TOKEN_SAVIOR_STATS_DIR: join(data, 'stats'),
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
    },
  }
}

/** Told to panels that have the index, so they reach for it before grep-and-read. */
export const SYMBOLS_RULE = `# Code index

This project is indexed (mcp__symbols__ tools). To find where something is defined, read one function or class, see its callers or a call chain, or search the code, use those tools first: find_symbol, get_function_source, get_full_context, get_call_chain, search_codebase. They return just that symbol, not whole files. Read a whole file only when you will edit it or need its overall shape.`
