import { describe, expect, it } from 'vitest'
import { BUILTIN_FORMATS, MAX_SLOT, detectFormat, fill, validateHook, type HookFormat } from './hookfmt.js'

const byId = (id: string): HookFormat => {
  const f = BUILTIN_FORMATS.find((x) => x.id === id)
  if (!f) throw new Error(`missing format ${id}`)
  return f
}

describe('built-in formats', () => {
  it('has the four formats, each with one slot', () => {
    expect(BUILTIN_FORMATS.map((f) => f.id)).toEqual(['choice', 'when', 'facts', 'sendto'])
    for (const f of BUILTIN_FORMATS) expect(f.template.split('{slot}')).toHaveLength(2)
  })
})

describe('fill', () => {
  it('fills each built-in template', () => {
    expect(fill(byId('choice'), 'Cats or dogs')).toEqual({ kind: 'ok', text: 'Cats or dogs?' })
    expect(fill(byId('when'), 'he opens the fridge')).toEqual({ kind: 'ok', text: 'When he opens the fridge' })
    expect(fill(byId('facts'), 'honey never spoils')).toEqual({ kind: 'ok', text: 'Facts: honey never spoils' })
    expect(fill(byId('sendto'), 'forgot the keys')).toEqual({
      kind: 'ok',
      text: 'Send this to the one who forgot the keys',
    })
  })

  it('trims the slot', () => {
    expect(fill(byId('facts'), '  spaced  ')).toEqual({ kind: 'ok', text: 'Facts: spaced' })
  })

  it('refuses an empty slot', () => {
    expect(fill(byId('when'), '   ')).toEqual({ kind: 'bad-slot', reason: 'slot is empty' })
  })

  it('refuses a multi-line slot', () => {
    expect(fill(byId('facts'), 'one\ntwo')).toEqual({ kind: 'bad-slot', reason: 'slot must be one line' })
  })

  it('refuses a slot over the limit', () => {
    const r = fill(byId('facts'), 'x'.repeat(MAX_SLOT + 1))
    expect(r.kind).toBe('bad-slot')
  })

  it('refuses a slot that contains the placeholder', () => {
    expect(fill(byId('facts'), 'a {slot} b')).toEqual({
      kind: 'bad-slot',
      reason: 'slot cannot contain the placeholder',
    })
  })

  it('accepts a user format with regex characters in its text', () => {
    const custom: HookFormat = { id: 'facts', label: 'x', template: 'Score (1.0+): {slot}' }
    expect(fill(custom, 'ok')).toEqual({ kind: 'ok', text: 'Score (1.0+): ok' })
  })
})

describe('validateHook', () => {
  it('accepts a caption that keeps the shape', () => {
    expect(validateHook(byId('when'), 'When he sings in the rain')).toEqual({ kind: 'ok' })
    expect(validateHook(byId('choice'), 'Tea or coffee?')).toEqual({ kind: 'ok' })
  })

  it('round-trips what fill produces', () => {
    for (const f of BUILTIN_FORMATS) {
      const r = fill(f, 'a sample slot')
      expect(r.kind).toBe('ok')
      if (r.kind === 'ok') expect(validateHook(f, r.text)).toEqual({ kind: 'ok' })
    }
  })

  it('refuses a caption with the wrong prefix', () => {
    expect(validateHook(byId('facts'), 'Fact: water is wet')).toEqual({
      kind: 'bad-shape',
      reason: 'caption does not keep the template shape',
    })
  })

  it('refuses a caption with a missing suffix', () => {
    expect(validateHook(byId('choice'), 'Tea or coffee')).toEqual({
      kind: 'bad-shape',
      reason: 'caption does not keep the template shape',
    })
  })

  it('refuses an empty slot inside the shape', () => {
    expect(validateHook(byId('sendto'), 'Send this to the one who ')).toEqual({
      kind: 'bad-shape',
      reason: 'slot is empty',
    })
  })

  it('refuses a multi-line slot inside the shape', () => {
    expect(validateHook(byId('facts'), 'Facts: line one\nline two').kind).toBe('bad-shape')
  })
})

describe('detectFormat', () => {
  it('detects each built-in format', () => {
    expect(detectFormat('Facts: bees dance to talk')).toBe('facts')
    expect(detectFormat('When he sees the bill')).toBe('when')
    expect(detectFormat('When she finally says it')).toBe('when')
    expect(detectFormat('When they finally agree')).toBe('when')
    expect(detectFormat('When your mom calls')).toBe('when')
    expect(detectFormat('When you open the app')).toBe('when')
    expect(detectFormat('when my cat knocks the cup')).toBe('when')
    expect(detectFormat('Send this to the one who skips leg day')).toBe('sendto')
    expect(detectFormat('Tea or coffee?')).toBe('choice')
  })

  it('ignores case and surrounding space on prefixes', () => {
    expect(detectFormat('  facts: lower case  ')).toBe('facts')
    expect(detectFormat('send this to the one who waits')).toBe('sendto')
  })

  it('returns null for text that matches no format', () => {
    expect(detectFormat('Just a normal sentence.')).toBeNull()
    expect(detectFormat('Which one?')).toBeNull()
    expect(detectFormat('')).toBeNull()
  })

  it('matches "when" only at the start of the caption', () => {
    expect(detectFormat('Tell me what happens when he sees the bill')).toBeNull()
    expect(detectFormat('Nothing happens when my cat knocks the cup')).toBeNull()
  })
})
