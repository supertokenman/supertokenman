// Small tasks (a commit message, a reply suggestion, the router's tie-break, a post draft): one prompt,
// one short answer, no tools. They run on a local model through Ollama when the person picks one,
// free and off their Claude plan; otherwise on Claude's smallest model, as before.

export const OLLAMA = process.env.STM_OLLAMA ?? 'http://127.0.0.1:11434'

/** How long a model stays in memory after its last task; Ollama unloads it then, freeing the RAM. */
export const KEEP_ALIVE = '2m'

export type LocalModel = { name: string; size: number; family?: string; params?: string }
export type SmallStats = { local: number; claude: number; localTokens: number; claudeUsd: number }
export const emptyStats = (): SmallStats => ({ local: 0, claude: 0, localTokens: 0, claudeUsd: 0 })

/** Ollama's models on this Mac, or null when it is not running. */
export async function localModels(doFetch: typeof fetch = fetch): Promise<LocalModel[] | null> {
  try {
    const r = await doFetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return null
    const j = (await r.json()) as { models?: { name: string; size: number; details?: { family?: string; parameter_size?: string } }[] }
    return (j.models ?? []).map((m) => ({ name: m.name, size: m.size, family: m.details?.family, params: m.details?.parameter_size }))
  } catch {
    return null
  }
}

/** A model id `ep:<id>/<model>` names one on your own OpenAI-compatible server; main tells where it is. */
export type Resolved = { baseUrl: string; key?: string; sampling: Record<string, number> }
let resolveEp: (model: string) => (Resolved & { model: string }) | null = () => null
export const setEndpointResolver = (f: typeof resolveEp) => void (resolveEp = f)
const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

async function askEndpoint(ep: Resolved & { model: string }, messages: { role: string; content: string }[], doFetch: typeof fetch, timeoutMs: number, maxTokens = 512) {
  const r = await doFetch(`${ep.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ep.key ? { authorization: `Bearer ${ep.key}` } : {}) },
    body: JSON.stringify({ model: ep.model, messages, max_tokens: maxTokens, stream: false, ...ep.sampling }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`The model server answered ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  return { text: stripThink(j.choices?.[0]?.message?.content ?? ''), tokens: (j.usage?.prompt_tokens ?? 0) + (j.usage?.completion_tokens ?? 0), read: j.usage?.prompt_tokens ?? 0 }
}

/** One answer from a local model; the token counts come back for the meter. */
export async function askLocal(model: string, prompt: string, doFetch: typeof fetch = fetch, ctx = 8192, timeoutMs = 120_000): Promise<{ text: string; tokens: number; read: number }> {
  if (model.startsWith('ep:')) {
    const ep = resolveEp(model)
    if (!ep) throw new Error('That model server is no longer set up.')
    return askEndpoint(ep, [{ role: 'user', content: prompt }], doFetch, timeoutMs)
  }
  const r = await doFetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // chores need an answer, not a chain of thought: thinking off (and Qwen3's own switch, for older Ollama), and a cap on length
    body: JSON.stringify({ model, messages: [{ role: 'user', content: /qwen3/i.test(model) ? `${prompt}\n\n/no_think` : prompt }], stream: false, think: false, keep_alive: KEEP_ALIVE, options: { temperature: 0.2, num_ctx: ctx, num_predict: 512 } }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`Ollama answered ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }
  // reasoning models may think aloud first: keep the answer only
  const text = (j.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  return { text, tokens: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0), read: j.prompt_eval_count ?? 0 }
}

/** Ollama's version, or null when the server is not answering. */
export async function ollamaVersion(doFetch: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await doFetch(`${OLLAMA}/api/version`, { signal: AbortSignal.timeout(1500) })
    return r.ok ? (((await r.json()) as { version?: string }).version ?? '?') : null
  } catch {
    return null
  }
}

// where the app and the command land when Ollama is installed on a Mac (and on Linux, for tests)
export const OLLAMA_PATHS = ['/Applications/Ollama.app', '/opt/homebrew/bin/ollama', '/usr/local/bin/ollama', '/usr/bin/ollama']

export type Loaded = { name: string; bytes: number; until: string }
/** The models in memory right now and when each unloads, or null when Ollama is not running. */
export async function loadedModels(doFetch: typeof fetch = fetch): Promise<Loaded[] | null> {
  try {
    const r = await doFetch(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return null
    const j = (await r.json()) as { models?: { name: string; size: number; size_vram?: number; expires_at: string }[] }
    return (j.models ?? []).map((m) => ({ name: m.name, bytes: m.size_vram || m.size, until: m.expires_at }))
  } catch {
    return null
  }
}

export type SmallDeps = {
  /** the model the person picked in Spend, or none */
  model: () => string | undefined
  claude: (prompt: string, cwd?: string) => Promise<{ text: string; costUsd: number }>
  stats: () => SmallStats
  save: (s: SmallStats) => void
  /** a task done on this Mac, with its token count, for the savings ledger */
  onLocal?: (tokens: number) => void
  /** a preset for this kind of task, from the arena: 'claude' skips the local model */
  prefer?: (prompt: string) => 'local' | 'claude' | null
  /** where each task went and why, for the choice log */
  onChoice?: (prompt: string, where: 'local' | 'claude', why: 'preset' | 'model' | 'fallback' | 'no-model' | 'claude-down' | 'deferred', ms: number, note?: string) => void
  /** the cascade: why a local draft cannot stand and goes up to Claude, or null */
  defer?: (prompt: string, answer: string) => string | null
  fetch?: typeof fetch
}

/** Runs a small task where the person chose; a local model that fails hands the task to Claude. */
export function smallTasks(d: SmallDeps) {
  return async (prompt: string, cwd?: string): Promise<{ text: string; where: 'local' | 'claude' }> => {
    const model = d.model()
    const preset = model ? d.prefer?.(prompt) ?? null : null
    const t = Date.now()
    let why: 'preset' | 'model' | 'fallback' | 'no-model' = !model ? 'no-model' : preset === 'claude' ? 'preset' : 'model'
    if (model && preset !== 'claude') {
      try {
        const r = await askLocal(model, prompt, d.fetch)
        const doubt = r.text ? d.defer?.(prompt, r.text) ?? null : null
        if (doubt) {
          // Claude checks it; if Claude is down, the draft is still better than nothing
          const c = await d.claude(prompt, cwd).catch(() => null)
          if (!c) {
            d.onChoice?.(prompt, 'local', 'claude-down', Date.now() - t, doubt)
            return { text: r.text, where: 'local' }
          }
          const s = d.stats()
          d.save({ ...s, claude: s.claude + 1, claudeUsd: s.claudeUsd + c.costUsd })
          d.onChoice?.(prompt, 'claude', 'deferred', Date.now() - t, doubt)
          return { text: c.text, where: 'claude' }
        }
        if (r.text) {
          const s = d.stats()
          d.save({ ...s, local: s.local + 1, localTokens: s.localTokens + r.tokens })
          d.onLocal?.(r.tokens)
          d.onChoice?.(prompt, 'local', preset === 'local' ? 'preset' : 'model', Date.now() - t)
          return { text: r.text, where: 'local' }
        }
      } catch {
        // Ollama stopped or the model is gone: Claude takes it
      }
      why = 'fallback'
    }
    let r: { text: string; costUsd: number }
    try {
      r = await d.claude(prompt, cwd)
    } catch (e) {
      // Claude out of quota, overloaded or offline: the local model takes it if it was skipped
      if (!model || preset !== 'claude') throw e
      const l = await askLocal(model, prompt, d.fetch)
      if (!l.text) throw e
      d.onLocal?.(l.tokens)
      d.onChoice?.(prompt, 'local', 'claude-down', Date.now() - t)
      return { text: l.text, where: 'local' }
    }
    const s = d.stats()
    d.save({ ...s, claude: s.claude + 1, claudeUsd: s.claudeUsd + r.costUsd })
    d.onChoice?.(prompt, 'claude', why, Date.now() - t)
    return { text: r.text, where: 'claude' }
  }
}

/** Reads Ollama's newline-delimited JSON stream, one object per line, as it arrives. */
async function* ndjson(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield JSON.parse(line) as Record<string, unknown>
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as Record<string, unknown>
}

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }

/** A conversation with the local model, streamed: each piece of the answer as it comes, then the totals. */
export async function chatLocal(model: string, messages: ChatMsg[], onDelta: (text: string) => void, signal?: AbortSignal, doFetch: typeof fetch = fetch) {
  if (model.startsWith('ep:')) {
    const ep = resolveEp(model)
    if (!ep) throw new Error('That model server is no longer set up.')
    const r = await askEndpoint(ep, messages, doFetch, 300_000, 4096)
    onDelta(r.text)
    return { tokens: r.tokens }
  }
  const r = await doFetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, think: false, keep_alive: KEEP_ALIVE, options: { temperature: 0.3, num_ctx: 8192 } }),
    signal,
  })
  if (!r.ok || !r.body) throw new Error(`Ollama answered ${r.status}`)
  let tokens = 0
  let thinking = false
  for await (const m of ndjson(r.body)) {
    let piece = String((m.message as { content?: string } | undefined)?.content ?? '')
    // a reasoning model's <think> part is not the answer
    if (piece.includes('<think>')) thinking = true
    if (thinking) {
      const end = piece.indexOf('</think>')
      if (end < 0) continue
      thinking = false
      piece = piece.slice(end + 8)
    }
    if (piece) onDelta(piece)
    if (m.done) tokens = Number(m.prompt_eval_count ?? 0) + Number(m.eval_count ?? 0)
  }
  return { tokens }
}

/** Downloads a model, telling how far along it is (0 to 1) and in which step. */
export async function pullModel(name: string, onProgress: (p: { status: string; done: number }) => void, signal?: AbortSignal, doFetch: typeof fetch = fetch) {
  const r = await doFetch(`${OLLAMA}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }), signal })
  if (!r.ok || !r.body) throw new Error(`Ollama answered ${r.status}`)
  for await (const m of ndjson(r.body)) {
    if (m.error) throw new Error(String(m.error))
    const total = Number(m.total ?? 0)
    onProgress({ status: String(m.status ?? ''), done: total ? Number(m.completed ?? 0) / total : m.status === 'success' ? 1 : 0 })
  }
}

/** Models worth having for each job, small enough for a laptop. */
export const SUGGESTED = [
  { name: 'qwen3:4b-instruct', job: 'Chores, drafts, picking a persona', size: '2.5 GB' },
  { name: 'qwen2.5-coder:7b', job: 'Code: explain an error, read a file', size: '4.7 GB' },
  { name: 'llama3.2:3b', job: 'Quick answers in plain words', size: '2.0 GB' },
  { name: 'gemma3:4b', job: 'Text and images', size: '3.3 GB' },
]
