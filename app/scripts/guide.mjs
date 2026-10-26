// Writes the app's manual to docs/STM_GUIDE.md: the same text Claude panels read, for any other
// provider's system prompt (Ollama, OpenAI, Gemini) and for people. Run: npm run guide
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fullGuide } from '../dist-electron/shared/manual.js'

const out = join(import.meta.dirname, '..', '..', 'docs', 'STM_GUIDE.md')
mkdirSync(join(out, '..'), { recursive: true })
writeFileSync(out, fullGuide())
console.log(`wrote ${out}`)
