// Token counts for what is about to be sent. Exact when an Anthropic API key is in the vault: the
// count_tokens endpoint is free and uses the model's own tokenizer. Otherwise an estimate, marked as
// one, from the text's bytes (prose runs about 4 bytes a token, code and JSON nearer 3).

export type Count = { tokens: number; exact: boolean }

/** A local estimate: denser text (code, JSON, logs) packs fewer bytes into each token. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const bytes = Buffer.byteLength(text, 'utf8')
  const symbols = (text.match(/[{}()[\];:=<>/\\|"'`,.]/g) ?? []).length
  const dense = Math.min(1, symbols / Math.max(1, text.length) / 0.12)
  return Math.ceil(bytes / (4 - dense))
}

export async function countTokens(text: string, opts: { apiKey?: string; model?: string; fetch?: typeof fetch } = {}): Promise<Count> {
  if (opts.apiKey && text) {
    try {
      const r = await (opts.fetch ?? fetch)('https://api.anthropic.com/v1/messages/count_tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: opts.model || 'claude-sonnet-5-5', messages: [{ role: 'user', content: text }] }),
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) {
        const j = (await r.json()) as { input_tokens?: number }
        // the request itself adds a few tokens of framing around the text
        if (typeof j.input_tokens === 'number') return { tokens: Math.max(0, j.input_tokens - 7), exact: true }
      }
    } catch {
      // offline or refused: the estimate stands in
    }
  }
  return { tokens: estimateTokens(text), exact: false }
}
