import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detect, renderCommand, scriptPrompt } from './engines'
import { addTurn, cleanPiece, emptyUsage, parseLufs, passed, videoChecks, windowShare } from './pieces'

describe('pieces', () => {
  it('gets an id from its title and starts at the idea', () => {
    const p = cleanPiece({ title: 'Cadência e joelho!' }, 1000)
    expect(p.id).toMatch(/^c[a-z0-9]+_cadencia_e_joelho$/)
    expect(p.stage).toBe('idea')
  })
  it('meters the turns and the 5-hour window', () => {
    let u = emptyUsage()
    u = addTurn(u, { inputTokens: 100, outputTokens: 50, cacheRead: 1000, cacheWrite: 0, costUsd: 0.01 }, 20)
    u = addTurn(u, { inputTokens: 10, outputTokens: 5, cacheRead: 0, cacheWrite: 0, costUsd: 0.002 }, 23.5)
    expect(u).toMatchObject({ inputTokens: 110, outputTokens: 55, turns: 2, window5hStart: 20, window5hNow: 23.5 })
    expect(windowShare(u)).toBeCloseTo(3.5)
  })
})

describe('video checks', () => {
  const probe = (w: number, h: number, fps: string, br: number, audio = true) => ({
    streams: [{ codec_type: 'video', width: w, height: h, avg_frame_rate: fps, codec_name: 'h264' }, ...(audio ? [{ codec_type: 'audio' }] : [])],
    format: { duration: '24.5', bit_rate: String(br) },
  })
  it('passes a platform-ready Reel', () => {
    const c = videoChecks(probe(1080, 1920, '30/1', 8e6), -14.2, 'reel')
    expect(c.every((x) => x.ok)).toBe(true)
  })
  it('flags what would look or sound amateur', () => {
    const c = videoChecks(probe(720, 1280, '24/1', 1.5e6, false), null, 'reel')
    expect(c.find((x) => x.name === 'Bitrate')).toMatchObject({ ok: false, warn: false })
    expect(c.find((x) => x.name === 'Audio')).toMatchObject({ ok: false, warn: true })
    expect(passed(c)).toBe(false)
  })
  it('reads ffmpeg loudness', () => {
    expect(parseLufs('  Integrated loudness:\n    I:         -14.3 LUFS\n')).toBe(-14.3)
    expect(parseLufs('nothing')).toBeNull()
  })
})

describe('engines', () => {
  it('finds the bzcorrida studio and builds its prompt and command', () => {
    const root = mkdtempSync(join(tmpdir(), 'proj-'))
    mkdirSync(join(root, 'studio', 'bz'), { recursive: true })
    writeFileSync(join(root, 'studio', 'bz', 'gerar.py'), '')
    const e = detect(root)
    expect(e).toMatchObject({ id: 'bzcorrida', ready: true })
    const p = cleanPiece({ title: 'Gel quando', scriptPath: join(root, 'studio', 'bz', 'roteiros', 'x.json') })
    expect(scriptPrompt(p, e)).toContain(`"id": "${p.id}"`)
    expect(renderCommand(p, e)).toMatchObject({ cmd: 'python3', args: ['bz/gerar.py', p.scriptPath, join(root, 'studio', 'out', 'content')] })
    const other = mkdtempSync(join(tmpdir(), 'p-'))
    expect(detect(other).id).toBe('revideo')
    expect(detect(other, 'post').id).toBe('text')
    const rv = detect(other)
    const piece = cleanPiece({ title: 'Lançamento', scriptPath: '/tmp/x/x.json' })
    expect(scriptPrompt(piece, rv)).toMatch(/"template": "explainer"/)
    expect(renderCommand(piece, rv)).toMatchObject({ cmd: 'node', args: [expect.stringMatching(/render\.mjs$/), '/tmp/x/x.json', '/tmp/x/out'] })
  })
})
