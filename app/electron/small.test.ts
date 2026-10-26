import { describe, expect, it } from 'vitest'
import { askLocal, chatLocal, emptyStats, localModels, pullModel, smallTasks, type SmallStats } from './small'

const ollama = (answer: string | null) =>
  (async (url: string) => {
    if (answer === null) throw new Error('ECONNREFUSED')
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3:4b', size: 2.5e9, details: { parameter_size: '4B' } }] }))
    return new Response(JSON.stringify({ message: { content: answer }, prompt_eval_count: 120, eval_count: 30 }))
  }) as unknown as typeof fetch

describe('small tasks', () => {
  it('lists local models, or says Ollama is not running', async () => {
    expect(await localModels(ollama('x'))).toEqual([{ name: 'qwen3:4b', size: 2.5e9, family: undefined, params: '4B' }])
    expect(await localModels(ollama(null))).toBeNull()
  })
  it('keeps only the answer of a model that thinks aloud', async () => {
    expect(await askLocal('qwen3:4b', 'hi', ollama('<think>hmm</think>\nfix: typo'))).toEqual({ text: 'fix: typo', tokens: 150, read: 120 })
  })
  it('runs on the local model when picked, counts it, and falls back to Claude when it fails', async () => {
    let stats: SmallStats = emptyStats()
    const claude = async () => ({ text: 'from claude', costUsd: 0.001 })
    const local = smallTasks({ model: () => 'qwen3:4b', claude, stats: () => stats, save: (s) => (stats = s), fetch: ollama('local answer') })
    expect(await local('p')).toEqual({ text: 'local answer', where: 'local' })
    const down = smallTasks({ model: () => 'qwen3:4b', claude, stats: () => stats, save: (s) => (stats = s), fetch: ollama(null) })
    expect(await down('p')).toEqual({ text: 'from claude', where: 'claude' })
    expect(stats).toMatchObject({ local: 1, localTokens: 150, claude: 1 })
  })
  it('skips the local model for a kind Claude wins, and goes back to it when Claude fails', async () => {
    const seen: string[] = []
    const failing = async () => {
      throw new Error('429 rate limited')
    }
    const t = smallTasks({ model: () => 'qwen3:4b', claude: failing, prefer: () => 'claude', onChoice: (_p, where, why) => seen.push(`${where}:${why}`), stats: emptyStats, save: () => undefined, fetch: ollama('local answer') })
    expect(await t('p')).toEqual({ text: 'local answer', where: 'local' })
    expect(seen).toEqual(['local:claude-down'])
    const doubtful = smallTasks({ model: () => 'qwen3:4b', claude: async () => ({ text: 'checked by claude', costUsd: 0.001 }), defer: (_p, a) => (a.includes('local') ? 'unsure' : null), onChoice: (_p, where, why, _ms, note) => seen.push(`${where}:${why}:${note}`), stats: emptyStats, save: () => undefined, fetch: ollama('local answer') })
    expect(await doubtful('p')).toEqual({ text: 'checked by claude', where: 'claude' })
    expect(seen.at(-1)).toBe('claude:deferred:unsure')
    const none = smallTasks({ model: () => undefined, claude: failing, stats: emptyStats, save: () => undefined })
    await expect(none('p')).rejects.toThrow('429')
  })
})

const stream = (lines: object[]) =>
  (async () => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const l of lines) c.enqueue(e.encode(JSON.stringify(l) + '\n')); c.close() } }))) as unknown as typeof fetch

describe('streamed local model', () => {
  it('streams the answer, leaves out a <think> part and counts tokens', async () => {
    const got: string[] = []
    const r = await chatLocal('m', [{ role: 'user', content: 'hi' }], (d) => got.push(d), undefined, stream([{ message: { content: '<think>hmm' } }, { message: { content: ' still</think>Hel' } }, { message: { content: 'lo' } }, { done: true, prompt_eval_count: 5, eval_count: 2 }]))
    expect(got.join('')).toBe('Hello')
    expect(r.tokens).toBe(7)
  })
  it('reports pull progress and errors', async () => {
    const seen: number[] = []
    await pullModel('x', (p) => seen.push(p.done), undefined, stream([{ status: 'pulling manifest' }, { status: 'downloading', total: 100, completed: 40 }, { status: 'success' }]))
    expect(seen).toEqual([0, 0.4, 1])
    await expect(pullModel('x', () => undefined, undefined, stream([{ error: 'not found' }]))).rejects.toThrow('not found')
  })
})
