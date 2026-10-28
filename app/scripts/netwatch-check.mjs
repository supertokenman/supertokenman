// Opens the built app with a clean profile for a while, nothing clicked, and fails when it reached for
// the network on its own. The allowed list is what the privacy page says the app does at launch.
// Needs a display (xvfb-run on Linux). Usage: node scripts/netwatch-check.mjs [seconds]
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const seconds = Number(process.argv[2] ?? 60)
const home = mkdtempSync(join(tmpdir(), 'stm-netwatch-'))
const out = join(home, 'net.jsonl')
const electron = createRequire(import.meta.url)('electron')
const linux = process.platform === 'linux'
const cmd = linux ? 'xvfb-run' : electron
const args = [...(linux ? ['-a', electron, '--no-sandbox'] : []), join(here, 'netwatch.mjs')]
spawnSync('timeout', [String(seconds), cmd, ...args], { env: { ...process.env, HOME: home, STM_NETWATCH_LOG: out }, stdio: 'ignore' })

// what the app may do with nobody asking: run Claude Code for the first panel, and look at this Mac
const allowed = [
  /^process \S*claude(\s|$)/,
  /^process git /,
  /^process docker (ps|stats) /,
  /^process (openshell|officecli) --version$/,
  /^process (sw_vers|system_profiler|ioreg|pmset|which|sh -c command -v) /,
]
// video transcripts are off by default and must start nothing on their own: the user's yt-dlp, whisper.cpp
// and ffmpeg are never allowed here, even if another pattern grows to match them (docs/NETWORK.md)
const never = /^process \S*(yt-dlp|whisper-cli|whisper-cpp|ffmpeg)(\s|$)/
if (!existsSync(out)) {
  console.error('netwatch: the app wrote nothing; did it start?')
  process.exit(2)
}
const seen = readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind !== 'ipc')
const bad = [...new Set(seen.map((e) => `${e.kind} ${e.target}`).filter((s) => never.test(s) || !allowed.some((re) => re.test(s))))]
console.log(`netwatch: ${seen.length} attempts in ${seconds}s, ${bad.length} not allowed`)
for (const b of bad) console.log('  ' + b)
process.exit(bad.length ? 1 : 0)
