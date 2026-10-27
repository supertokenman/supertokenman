// The renderer's start-up size: the script and style files dist/index.html loads before anything is
// clicked, gzipped. Fails over the budget, so a heavy import added to the first screen is seen in CI.
// The budget is set by hand when a change needs more, in the same commit, with the reason.
//
//   node scripts/startup-size.mjs [--max-js-kb 215]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { startupChunks } from './perf-lib.mjs'

const argv = process.argv.slice(2)
const max = Number(argv[argv.indexOf('--max-js-kb') + 1] || 215)
const dist = new URL('../dist/', import.meta.url).pathname
const files = startupChunks(readFileSync(join(dist, 'index.html'), 'utf8'))
const sizes = files.map((f) => ({ f, kb: gzipSync(readFileSync(join(dist, f))).length / 1024 }))
for (const s of sizes) console.log(`start-up: ${s.f} ${s.kb.toFixed(1)} KB gzip`)
const js = sizes.filter((s) => /\.m?js$/.test(s.f)).reduce((n, s) => n + s.kb, 0)
console.log(`start-up JS: ${js.toFixed(1)} KB gzip (budget ${max} KB)`)
if (js > max) {
  console.error(`start-up JS is over budget by ${(js - max).toFixed(1)} KB: load the new code lazily, or raise --max-js-kb in ci.yml with the reason`)
  process.exit(1)
}
