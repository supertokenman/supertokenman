// Your own model server, the parts with no network: OpenAI-compatible endpoints (vLLM, llama.cpp,
// LM Studio, Ollama), vLLM's Prometheus metrics read into rates, whether a model fits in memory before
// loading it, sampling presets, and the vLLM command for a GPU box. Ideas from vLLM (Apache-2.0) and
// textgen (AGPL-3.0, idea only); no code from either.

export type ServerKind = 'vllm' | 'llamacpp' | 'lmstudio' | 'ollama' | 'other'
export type Endpoint = { id: string; name: string; kind: ServerKind; baseUrl: string; keyName?: string; preset?: PresetId; template?: string }

export function checkEndpoint(e: Partial<Endpoint>): string | null {
  if (!e.name?.trim()) return 'An endpoint needs a name.'
  if (!/^https?:\/\/[^\s/]+/.test(e.baseUrl ?? '')) return 'The base URL must start with http:// or https://.'
  if (e.keyName && !/^[A-Z][A-Z0-9_]{1,63}$/.test(e.keyName)) return 'The key name is a vault name such as VLLM_API_KEY.'
  return null
}

/** The base without a trailing slash or /v1, so paths can be added. */
export const baseOf = (url: string) => url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')

/** A small-task model id that points at an endpoint: ep:<id>/<model>. */
export const epModel = (id: string, model: string) => `ep:${id}/${model}`
export function parseEpModel(s: string | undefined): { id: string; model: string } | null {
  const m = /^ep:([\w-]+)\/(.+)$/.exec(s ?? '')
  return m ? { id: m[1]!, model: m[2]! } : null
}

export type PresetId = 'precise' | 'balanced' | 'creative' | 'code'
export const PRESETS: Record<PresetId, { label: string; temperature: number; top_p: number; top_k?: number; min_p?: number; repetition_penalty?: number }> = {
  precise: { label: 'Precise', temperature: 0.1, top_p: 0.9, top_k: 20 },
  balanced: { label: 'Balanced', temperature: 0.6, top_p: 0.95, top_k: 40, min_p: 0.05 },
  creative: { label: 'Creative', temperature: 1.0, top_p: 0.98, min_p: 0.05, repetition_penalty: 1.05 },
  code: { label: 'Code', temperature: 0.2, top_p: 0.95, top_k: 40, repetition_penalty: 1.0 },
}
/** Sampling fields for an OpenAI-compatible request; servers that do not know top_k or min_p ignore them. */
export const sampling = (p: PresetId | undefined) => {
  const { label: _l, ...s } = PRESETS[p ?? 'precise']
  return s
}

/** Prometheus text format to sample name (with labels folded away) to summed value. */
export function parsePrometheus(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const m = /^([a-zA-Z_:][\w:]*)(?:\{[^}]*\})?\s+([-+0-9.eEInfNa]+)/.exec(line)
    if (!m) continue
    const v = Number(m[2])
    if (Number.isFinite(v)) out[m[1]!] = (out[m[1]!] ?? 0) + v
  }
  return out
}

const pick = (m: Record<string, number>, names: string[]) => names.map((n) => m[n]).find((v) => v != null)

export type ServerStats = { tokensPerSec: number | null; promptPerSec: number | null; ttftMs: number | null; kvCache: number | null; prefixHit: number | null; running: number | null; waiting: number | null }
/**
 * Two scrapes of vLLM's /metrics, `dt` seconds apart, into what you want to see: generated tokens per
 * second, mean time to first token over the interval, KV cache use and the prefix cache hit rate.
 * Names differ between vLLM versions, so each figure tries the known names.
 */
export function serverStats(a: Record<string, number>, b: Record<string, number>, dt: number): ServerStats {
  const delta = (names: string[]) => {
    const x = pick(a, names)
    const y = pick(b, names)
    return x != null && y != null ? Math.max(0, y - x) : null
  }
  const gen = delta(['vllm:generation_tokens_total'])
  const prompt = delta(['vllm:prompt_tokens_total'])
  const ttSum = delta(['vllm:time_to_first_token_seconds_sum'])
  const ttCount = delta(['vllm:time_to_first_token_seconds_count'])
  const hits = delta(['vllm:prefix_cache_hits_total', 'vllm:gpu_prefix_cache_hits_total', 'vllm:prefix_cache_hits'])
  const queries = delta(['vllm:prefix_cache_queries_total', 'vllm:gpu_prefix_cache_queries_total', 'vllm:prefix_cache_queries'])
  const kv = pick(b, ['vllm:kv_cache_usage_perc', 'vllm:gpu_cache_usage_perc'])
  return {
    tokensPerSec: gen != null && dt > 0 ? Math.round((gen / dt) * 10) / 10 : null,
    promptPerSec: prompt != null && dt > 0 ? Math.round((prompt / dt) * 10) / 10 : null,
    ttftMs: ttSum != null && ttCount ? Math.round((ttSum / ttCount) * 1000) : null,
    kvCache: kv ?? null,
    prefixHit: hits != null && queries ? hits / queries : null,
    running: pick(b, ['vllm:num_requests_running']) ?? null,
    waiting: pick(b, ['vllm:num_requests_waiting']) ?? null,
  }
}

export type FitInput = { paramsB: number; bits: number; layers: number; kvHeads: number; headDim: number; context: number; batch: number; kvBits: number; memoryGb: number; overheadGb?: number }
/**
 * Whether a model fits before loading it: weights at the chosen quantization, plus the KV cache for
 * `batch` sequences of `context` tokens (keys and values, every layer), plus runtime overhead.
 */
export function fit(i: FitInput): { weightsGb: number; kvGb: number; overheadGb: number; totalGb: number; fits: boolean; maxContext: number } {
  const GB = 1024 ** 3
  const weightsGb = (i.paramsB * 1e9 * i.bits) / 8 / GB
  const kvPerToken = 2 * i.layers * i.kvHeads * i.headDim * (i.kvBits / 8)
  const kvGb = (kvPerToken * i.context * i.batch) / GB
  const overheadGb = i.overheadGb ?? Math.max(0.5, weightsGb * 0.08)
  const totalGb = weightsGb + kvGb + overheadGb
  const left = (i.memoryGb - weightsGb - overheadGb) * GB
  const maxContext = left > 0 && kvPerToken > 0 ? Math.floor(left / kvPerToken / Math.max(1, i.batch)) : 0
  const r = (n: number) => Math.round(n * 100) / 100
  return { weightsGb: r(weightsGb), kvGb: r(kvGb), overheadGb: r(overheadGb), totalGb: r(totalGb), fits: totalGb <= i.memoryGb, maxContext }
}

/** Shapes of common open models, to fill the fit form. */
export const SHAPES: Record<string, Pick<FitInput, 'paramsB' | 'layers' | 'kvHeads' | 'headDim'>> = {
  'Llama 3.1 8B': { paramsB: 8, layers: 32, kvHeads: 8, headDim: 128 },
  'Llama 3.3 70B': { paramsB: 70.6, layers: 80, kvHeads: 8, headDim: 128 },
  'Qwen3 8B': { paramsB: 8.2, layers: 36, kvHeads: 8, headDim: 128 },
  'Qwen3 32B': { paramsB: 32.8, layers: 64, kvHeads: 8, headDim: 128 },
  'Mistral Small 24B': { paramsB: 23.6, layers: 40, kvHeads: 8, headDim: 128 },
  'Gemma 3 27B': { paramsB: 27, layers: 62, kvHeads: 16, headDim: 128 },
}

export type VllmArgs = { model: string; port: number; maxModelLen?: number; gpuMemory?: number; tensorParallel?: number; quantization?: string; keyName?: string; prefixCaching?: boolean }
const shq = (s: string) => (/^[\w.:/@=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)
/**
 * The command that starts vLLM's OpenAI-compatible server on the GPU box, bound to localhost (reach it
 * through the SSH tunnel), in the background with a log and a pid file so it can be stopped.
 */
export function vllmCommand(a: VllmArgs): string {
  if (!/^[\w./@:-]{2,200}$/.test(a.model)) throw new Error('The model is a Hugging Face id such as Qwen/Qwen3-8B.')
  if (!(a.port >= 1024 && a.port <= 65535)) throw new Error('Pick a port between 1024 and 65535.')
  const args = ['vllm', 'serve', shq(a.model), '--host', '127.0.0.1', '--port', String(a.port)]
  if (a.maxModelLen) args.push('--max-model-len', String(Math.round(a.maxModelLen)))
  if (a.gpuMemory) args.push('--gpu-memory-utilization', String(Math.min(0.98, Math.max(0.1, a.gpuMemory))))
  if (a.tensorParallel && a.tensorParallel > 1) args.push('--tensor-parallel-size', String(Math.round(a.tensorParallel)))
  if (a.quantization) args.push('--quantization', shq(a.quantization))
  if (a.prefixCaching !== false) args.push('--enable-prefix-caching')
  // the key never goes on the command line: vLLM reads VLLM_API_KEY from the environment of the remote shell
  const env = a.keyName ? 'VLLM_API_KEY="$(cat ~/.config/stm/vllm-key)" ' : ''
  return `mkdir -p ~/.cache/stm && ${env}nohup ${args.join(' ')} > ~/.cache/stm/vllm-${a.port}.log 2>&1 & echo $! > ~/.cache/stm/vllm-${a.port}.pid`
}
export const vllmStop = (port: number) => `kill "$(cat ~/.cache/stm/vllm-${port}.pid)" && rm -f ~/.cache/stm/vllm-${port}.pid`
export const tunnelArgs = (host: string, local: number, remote: number) => ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', `127.0.0.1:${local}:127.0.0.1:${remote}`, host]
