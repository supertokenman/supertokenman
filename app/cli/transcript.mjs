// stm transcript <url|file> [--timestamps] [--fresh]: a video's transcript as plain text, from the app's
// transcripts module (off until turned on in the app's Settings). The route used goes to stderr.
// Reads its own flags from argv so stm's shared flag parser stays as it is.
export async function runTranscript(call, { json }, argv = process.argv.slice(2)) {
  const flags = { timestamps: argv.includes('--timestamps'), fresh: argv.includes('--fresh') }
  const input = argv.filter((a) => !a.startsWith('--'))[1]
  if (!input) throw new Error('Usage: stm transcript <url|file> [--timestamps] [--fresh]')
  const { resolve } = await import('node:path')
  const arg = /^https?:\/\//i.test(input) ? input : resolve(input)
  const d = await call('transcript', { input: arg, timestamps: Boolean(flags.timestamps), fresh: Boolean(flags.fresh) })
  if (json) return process.stdout.write(`${JSON.stringify({ ok: true, data: { id: d.id, route: d.route, cached: d.cached, truncated: d.truncated, text: d.display } })}\n`)
  process.stderr.write(`[${d.route}${d.cached ? ', cached' : ''}${d.truncated ? ', cut at 200,000 characters' : ''}]\n`)
  process.stdout.write(`${d.display}\n`)
}
