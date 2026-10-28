import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { cap, parseSubs, parseWhisperJson, pickRoute, toText, youtubeId } from '../shared/transcript'
import { getTranscript, writeCache, type Deps } from './transcripts'

const FX = join(__dirname, '__fixtures__', 'transcripts')
const fx = (n: string) => readFileSync(join(FX, n), 'utf8')
const tmp = () => mkdtempSync(join(tmpdir(), 'stm-tx-'))
const deps = (over: Partial<Deps> = {}): Deps => ({ dir: join(tmp(), 'cache'), enabled: () => true, which: () => null, run: vi.fn(async () => ({ stdout: '' })), now: () => 1, ...over })

describe('transcripts: parsing', () => {
  it('reads auto-caption WebVTT, drops tags and rolling repeats', () => {
    const c = parseSubs(fx('auto.en.vtt'))
    expect(c.map((x) => x.text)).toEqual(['hello and welcome', 'to the show & more', 'the end'])
    expect(c[2].start).toBe(3723)
    expect(toText(c)).toBe('hello and welcome to the show & more the end')
    expect(toText(c, true).split('\n')[2]).toBe('[1:02:03] the end')
  })
  it('reads SRT with CRLF', () => {
    expect(toText(parseSubs(fx('talk.srt')), true)).toBe('[0:01] First line\n[1:05] Second line')
  })
  it("reads whisper.cpp's JSON", () => {
    expect(parseWhisperJson(fx('whisper.json'))).toEqual([
      { start: 0, text: 'Hello from whisper.' },
      { start: 64, text: 'Second segment.' },
    ])
  })
})

describe('transcripts: route selection', () => {
  const none = { ytdlp: false, whisper: false }
  const all = { ytdlp: true, whisper: true }
  it('never fetches YouTube, even with yt-dlp installed', () => {
    expect(pickRoute('https://www.youtube.com/watch?v=dQw4w9WgXcQ', all)).toHaveProperty('refuse')
    expect(pickRoute('https://youtu.be/dQw4w9WgXcQ', all)).toHaveProperty('refuse')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it("other links need the person's own yt-dlp", () => {
    expect(pickRoute('https://vimeo.com/1', none)).toHaveProperty('refuse')
    expect(pickRoute('https://vimeo.com/1', all)).toEqual({ route: 'yt-dlp' })
  })
  it('files: subtitles parse directly, media needs whisper', () => {
    expect(pickRoute('/a/b.srt', none)).toEqual({ route: 'subtitle-file' })
    expect(pickRoute('/a/b.mp4', none)).toHaveProperty('refuse')
    expect(pickRoute('/a/b.mp4', all)).toEqual({ route: 'whisper' })
  })
})

describe('transcripts: off by default', () => {
  it('when off: no process, no tool lookup, no request, no cache write', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const which = vi.fn(() => '/usr/bin/yt-dlp')
    const d = deps({ enabled: () => false, which })
    await expect(getTranscript({ input: 'https://vimeo.com/1' }, d)).rejects.toThrow(/off/)
    await expect(getTranscript({ input: 'x', text: 'pasted' }, d)).rejects.toThrow(/off/)
    expect(d.run).not.toHaveBeenCalled()
    expect(which).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('transcripts: routes, cache and cap', () => {
  it('a subtitle file, then the cache', async () => {
    const d = deps()
    const f = join(tmp(), 'talk.srt')
    copyFileSync(join(FX, 'talk.srt'), f)
    const a = await getTranscript({ input: f }, d)
    expect([a.route, a.cached, a.text]).toEqual(['subtitle-file', false, 'First line Second line'])
    const b = await getTranscript({ input: f, timestamps: true }, d)
    expect(b.cached).toBe(true)
    expect(b.display).toBe('[0:01] First line\n[1:05] Second line')
  })
  it('yt-dlp: captions only, no cookies, parsed from its .vtt', async () => {
    const run = vi.fn(async (_b: string, args: string[]) => {
      writeFileSync(args[args.indexOf('-o') + 1].replace('%(ext)s', 'en.vtt'), fx('auto.en.vtt'))
      return { stdout: '' }
    })
    const r = await getTranscript({ input: 'https://vimeo.com/42' }, deps({ which: (n) => (n === 'yt-dlp' ? '/u/yt-dlp' : null), run }))
    expect(r.route).toBe('yt-dlp')
    const args = run.mock.calls[0][1]
    expect(args).toContain('--skip-download')
    expect(args.join(' ')).not.toMatch(/cookies/)
  })
  it('whisper: a wav with a model, JSON parsed', async () => {
    const run = vi.fn(async (_b: string, args: string[]) => {
      writeFileSync(`${args[args.indexOf('-of') + 1]}.json`, fx('whisper.json'))
      return { stdout: '' }
    })
    const f = join(tmp(), 'a.wav')
    writeFileSync(f, 'RIFF')
    const r = await getTranscript({ input: f }, deps({ which: (n) => (n === 'whisper-cli' ? '/u/whisper-cli' : null), run, whisperModel: () => '/m/ggml-base.en.bin' }))
    expect([r.route, r.text]).toEqual(['whisper', 'Hello from whisper. Second segment.'])
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('caps a transcript and the cache folder', async () => {
    expect(cap('abcdef', 3)).toEqual({ text: 'abc', truncated: true })
    const r = await getTranscript({ input: 'https://example.com/v', text: 'x'.repeat(250_000) }, deps())
    expect([r.truncated, r.text.length]).toEqual([true, 200_000])
    const dir = join(tmp(), 'c')
    mkdirSync(dir)
    for (let i = 0; i < 5; i++) writeCache(dir, { id: `v${i}`, source: 's', route: 'paste', text: 'y'.repeat(1000), cues: [], truncated: false, at: i }, 2500)
    expect(readdirSync(dir)).toHaveLength(2)
    expect(readdirSync(dir)).toContain('v4.json')
  })
})
