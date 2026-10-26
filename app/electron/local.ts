// Chores a panel hands to the local model: reading a long file or log to answer one question, or a
// short drafting job. Claude decides what is trivial, since it already knows the task; the local
// model does it on this Mac and only the answer comes back, so the file never fills Claude's context.
// The model loads for the task and Ollama unloads it two minutes later.
import { createSdkMcpServer, tool, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import { askLocal } from './small.js'

/** About what a small model reads well in one go. */
export const MAX_CHARS = 60_000
export const READ_TOOL = 'mcp__local-model__local_read'
/** Told to every panel that has the local reader, so it reaches for it before reading a big file whole. */
export const LOCAL_RULE = `# Local model

A small model runs free on this Mac. Before you Read, cat or grep a large file (logs, test or build output, lockfiles, big JSON or CSV, generated code; anything over a few hundred lines) to learn a fact from it, ask mcp__local-model__local_read instead: the file stays out of your context and you get the answer plus the exact lines that look like failures. Read the file yourself only to edit it or when you need its exact text, and verify what the local answer says before you act on it.`
export const DRAFT_TOOL = 'mcp__local-model__local_draft'

export type Job = { kind: 'read' | 'draft'; model: string; what: string; ms: number; read: number; kept: number; at: number; ok: boolean }
export type LocalDeps = { model: () => string | undefined; cwd: string; done: (j: Job) => void; fetch?: typeof fetch; read: boolean; timeoutMs?: number }

/** Lines that look like failures or warnings, found without a model, so a small one does not miss them. */
export function suspects(text: string, max = 40): string[] {
  const re = /\b(fail(ed|ure|ing)?|error|exception|panic|fatal|traceback|warn(ing)?|timed? ?out|denied|refused)\b|[×✗✘]|^\s*(→|❯|>>>)|assert|\bE\d{3,}\b/i
  return [...new Set(text.split('\n').map((l) => l.trim()))].filter((l) => re.test(l) && !/^\s*([✓✔√]|PASS\b|ok\b)/.test(l) && !/\b0 (failed|errors?)\b/i.test(l)).slice(0, max).map((l) => l.slice(0, 300))
}

/** A file inside the project, read as text; never outside it, never binary, never huge. */
export function projectText(cwd: string, path: string): { text: string; cut: boolean } | { error: string } {
  const root = realpathSync(cwd)
  let full: string
  try {
    full = realpathSync(resolve(root, path))
  } catch {
    return { error: `No such file: ${path}` }
  }
  const rel = relative(root, full)
  if (rel.startsWith('..') || isAbsolute(rel)) return { error: 'Only files inside the project.' }
  const st = statSync(full)
  if (!st.isFile()) return { error: `${path} is not a file.` }
  if (st.size > 20 * 1024 * 1024) return { error: `${path} is over 20 MB.` }
  const buf = readFileSync(full)
  if (buf.subarray(0, 8000).includes(0)) return { error: `${path} is binary.` }
  const all = buf.toString('utf8')
  // a log's news is at its end: keep the tail
  return all.length > MAX_CHARS ? { text: all.slice(-MAX_CHARS), cut: true } : { text: all, cut: false }
}

/**
 * A whole-file Read of something big, turned once into a pointer to the local reader. A second try on
 * the same file goes through: Claude may truly need all of it, to edit it.
 */
export function bigRead(input: Record<string, unknown>, cwd: string, asked: Set<string>): string | null {
  const path = typeof input.file_path === 'string' ? input.file_path : ''
  if (!path || input.offset !== undefined || input.limit !== undefined || asked.has(path)) return null
  let size = 0
  try {
    const st = statSync(resolve(cwd, path))
    if (!st.isFile()) return null
    size = st.size
  } catch {
    return null
  }
  if (size < 40_000) {
    const lines = readFileSync(resolve(cwd, path), 'utf8').split('\n').length
    if (lines <= 400) return null
  }
  asked.add(path)
  return `${path} is large (${Math.round(size / 1024)} KB). To learn something from it, call mcp__local-model__local_read with your question: free, and the file stays out of your context. For exact text, Read it with offset and limit. If you truly need all of it, Read it again and it will go through.`
}

const fail = (text: string) => ({ content: [{ type: 'text' as const, text: `${text} Do it yourself instead.` }], isError: true })

export function localServer(d: LocalDeps): McpServerConfig {
  const run = async (kind: Job['kind'], what: string, prompt: string, ctx: number, exact = '') => {
    const model = d.model()
    if (!model) return fail('No local model is chosen.')
    const t0 = Date.now()
    const found = kind === 'read' && exact.includes('\n', 5) && !exact.includes('No line in the file')
    try {
      const r = await askLocal(model, prompt, d.fetch, ctx, d.timeoutMs)
      d.done({ kind, model, what, ms: Date.now() - t0, read: r.read, kept: r.text.length / 4, at: t0, ok: Boolean(r.text) })
      if (r.text) return { content: [{ type: 'text' as const, text: r.text + exact }] }
      return found ? { content: [{ type: 'text' as const, text: `The local model gave no answer.${exact}` }] } : fail('The local model gave no answer.')
    } catch (e) {
      const why = e instanceof Error ? e.message.slice(0, 120) : 'error'
      d.done({ kind, model, what, ms: Date.now() - t0, read: found ? prompt.length / 4 : 0, kept: exact.length / 4, at: t0, ok: found })
      // the lines found without the model still answer most questions about a log
      return found ? { content: [{ type: 'text' as const, text: `The local model did not answer (${why}).${exact}` }] } : fail(`The local model failed (${why}).`)
    }
  }
  return createSdkMcpServer({
    name: 'local-model',
    version: '1.0.0',
    tools: [
      ...(d.read ? [tool(
        'local_read',
        'Answer one question about a long file or log (test output, build log, a big JSON or CSV, generated code) using a small model running free on this Mac, so the file itself never enters your context. Use it when you need a fact from the file, not its exact text: "which tests failed and why", "does this log mention a timeout", "list the keys under dependencies". Read the file yourself when you will edit it or need exact lines. Check anything the answer will be acted on.',
        { path: z.string().describe('the file, relative to the project'), question: z.string().min(3).max(2000) },
        async ({ path, question }) => {
          const f = projectText(d.cwd, path)
          if ('error' in f) return fail(f.error)
          const hits = suspects(f.text)
          const flagged = hits.length ? `\n\nLines in the file that look like failures or warnings (${hits.length}${hits.length === 40 ? '+' : ''}):\n${hits.join('\n')}` : '\n\nNo line in the file looks like a failure or warning.'
          return run('read', path, `Answer the question about the file below. Be brief and exact; quote names, numbers and error lines as they appear. If the file does not say, answer "not in the file".\n\nQuestion: ${question}${flagged}\n\nFile ${path}${f.cut ? ' (its last part)' : ''}:\n"""\n${f.text}\n"""`, f.text.length > 24_000 ? 32_768 : 16_384, hits.length ? `\n\n---\nLines matched in the file without the model (exact text; trust these over any answer above):\n${hits.join('\n')}` : '\n\n---\nNo line in the file looks like a failure or warning (matched without the model).')
        },
        { annotations: { readOnlyHint: true } },
      )] : []),
      tool(
        'local_draft',
        'A small text job done free on this Mac: a commit message from a summary, a short reply, reformatting, a list turned into a table, a naming suggestion, a one-line classification. Use it for chores whose result you will glance at, not for reasoning, code changes or anything that needs the conversation.',
        { task: z.string().min(3).max(1000).describe('what to produce'), input: z.string().max(20_000).optional().describe('the text to work on') },
        async ({ task, input }) => run('draft', task.slice(0, 80), `${task}\n\nAnswer with the result only.${input ? `\n\n"""\n${input}\n"""` : ''}`, 8192),
      ),
    ],
  })
}
