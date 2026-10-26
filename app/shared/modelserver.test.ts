import { describe, expect, it } from 'vitest'
import { baseOf, checkEndpoint, epModel, fit, parseEpModel, parsePrometheus, sampling, serverStats, SHAPES, tunnelArgs, vllmCommand } from './modelserver'

const SCRAPE = (gen: number, ttSum: number, ttCount: number, hits: number, q: number) => `# HELP vllm:generation_tokens_total Number of generation tokens.
# TYPE vllm:generation_tokens_total counter
vllm:generation_tokens_total{model_name="Qwen/Qwen3-8B"} ${gen}
vllm:prompt_tokens_total{model_name="Qwen/Qwen3-8B"} ${gen * 4}
vllm:time_to_first_token_seconds_sum{model_name="Qwen/Qwen3-8B"} ${ttSum}
vllm:time_to_first_token_seconds_count{model_name="Qwen/Qwen3-8B"} ${ttCount}
vllm:prefix_cache_hits_total{model_name="Qwen/Qwen3-8B"} ${hits}
vllm:prefix_cache_queries_total{model_name="Qwen/Qwen3-8B"} ${q}
vllm:kv_cache_usage_perc{model_name="Qwen/Qwen3-8B"} 0.42
vllm:num_requests_running{model_name="Qwen/Qwen3-8B"} 2
vllm:num_requests_waiting{model_name="Qwen/Qwen3-8B"} 0
`

describe('model server', () => {
  it('checks endpoints and names local models', () => {
    expect(checkEndpoint({ name: 'GPU box', baseUrl: 'gpu:8000' })).toMatch(/http/)
    expect(checkEndpoint({ name: 'GPU box', baseUrl: 'http://127.0.0.1:8000/v1', keyName: 'bad key' })).toMatch(/vault/)
    expect(checkEndpoint({ name: 'GPU box', baseUrl: 'http://127.0.0.1:8000/v1', keyName: 'VLLM_API_KEY' })).toBeNull()
    expect(baseOf('http://127.0.0.1:8000/v1/')).toBe('http://127.0.0.1:8000')
    expect(parseEpModel(epModel('gpu', 'Qwen/Qwen3-8B'))).toEqual({ id: 'gpu', model: 'Qwen/Qwen3-8B' })
    expect(parseEpModel('qwen3:8b')).toBeNull()
    expect(sampling('code')).toEqual({ temperature: 0.2, top_p: 0.95, top_k: 40, repetition_penalty: 1 })
  })

  it('reads vLLM metrics into rates', () => {
    const a = parsePrometheus(SCRAPE(1000, 10, 40, 100, 400))
    expect(a['vllm:generation_tokens_total']).toBe(1000)
    const s = serverStats(a, parsePrometheus(SCRAPE(1600, 12, 50, 250, 600)), 10)
    expect(s).toEqual({ tokensPerSec: 60, promptPerSec: 240, ttftMs: 200, kvCache: 0.42, prefixHit: 0.75, running: 2, waiting: 0 })
    expect(serverStats({}, {}, 10)).toMatchObject({ tokensPerSec: null, ttftMs: null, kvCache: null })
  })

  it('says whether a model fits before loading it', () => {
    const base = { ...SHAPES['Llama 3.1 8B']!, bits: 16, context: 8192, batch: 1, kvBits: 16 }
    const f = fit({ ...base, memoryGb: 24 })
    expect(f.weightsGb).toBeCloseTo(14.9, 1)
    expect(f.kvGb).toBe(1) // 2 x 32 layers x 8 heads x 128 x 2 bytes x 8192 tokens = 1 GiB
    expect(f.fits).toBe(true)
    expect(fit({ ...base, memoryGb: 12 }).fits).toBe(false)
    expect(fit({ ...base, bits: 4, memoryGb: 12 }).fits).toBe(true)
    expect(fit({ ...base, memoryGb: 24 }).maxContext).toBeGreaterThan(50_000)
  })

  it('writes the vLLM command bound to localhost, with no key on the line', () => {
    const c = vllmCommand({ model: 'Qwen/Qwen3-8B', port: 8000, maxModelLen: 32768, gpuMemory: 0.9, keyName: 'VLLM_API_KEY' })
    expect(c).toContain('vllm serve Qwen/Qwen3-8B --host 127.0.0.1 --port 8000 --max-model-len 32768 --gpu-memory-utilization 0.9 --enable-prefix-caching')
    expect(c).toContain('$(cat ~/.config/stm/vllm-key)')
    expect(c).toContain('vllm-8000.pid')
    expect(() => vllmCommand({ model: 'x; rm -rf /', port: 8000 })).toThrow(/Hugging Face/)
    expect(() => vllmCommand({ model: 'a/b', port: 80 })).toThrow(/port/)
    expect(tunnelArgs('gpu', 18000, 8000)).toEqual(['-N', '-o', 'ExitOnForwardFailure=yes', '-L', '127.0.0.1:18000:127.0.0.1:8000', 'gpu'])
  })
})
