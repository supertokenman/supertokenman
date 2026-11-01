import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indexElements, MAX_ELEMENTS, roleOf, type Snapshot } from './browserindex'

const load = (name: string): Snapshot =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as Snapshot

describe('element indexing: login fixture', () => {
  const snap = load('snap-login.json')
  it('keeps visible interactive elements only, in reading order', () => {
    const r = indexElements(snap)
    // Help (top row) comes first; overlay-covered "Accept cookies", hidden, zero-size and plain divs are out.
    expect(r.lines).toEqual([
      '[1] link "Help"',
      '[2] textbox "Email" value: ana@example.com',
      '[3] textbox "Password" value: [hidden]',
      '[4] button "Sign in"',
      '[5] link "Forgot password?"',
      '[6] button "Remember me"',
    ])
    expect(r.total).toBe(6)
    expect(r.cut).toBe(false)
  })
  it('never shows a password value, not even in the text', () => {
    const r = indexElements(snap)
    expect(r.text).not.toContain('fake-pass-value-123')
    expect(r.elements.find((e) => e.name === 'Password')?.secret).toBe(true)
  })
  it('marks elements missing from the previous list as new', () => {
    const r = indexElements(snap, [4, 5])
    expect(r.elements.filter((e) => e.isNew).map((e) => e.id)).toEqual([11, 3, 6, 12])
    expect(r.lines[0]).toBe('*[1] link "Help"')
    expect(r.lines[3]).toBe('[4] button "Sign in"')
  })
})

describe('element indexing: checkout form fixture', () => {
  const snap = load('snap-form.json')
  it('maps tags and input types to roles and keeps the form controls', () => {
    const r = indexElements(snap)
    expect(r.lines).toEqual([
      '[1] combobox "Country" value: Brazil',
      '[2] textbox "Postal code" value: 01310-100',
      '[3] checkbox "Save address"',
      '[4] radio "Standard shipping"',
      '[5] radio "Express shipping"',
      '[6] textbox "Delivery note" value: ',
      '[7] button "Place order"',
      '[8] textbox "Card number" value: [hidden]',
    ])
  })
  it('drops the help button covered by a tooltip, but keeps it when it is the top element', () => {
    expect(indexElements(snap).elements.some((e) => e.id === 113)).toBe(false)
    const open = structuredClone(snap)
    open.nodes.find((n) => n.id === 113)!.topAt = 113
    expect(indexElements(open).elements.some((e) => e.id === 113)).toBe(true)
  })
})

describe('element indexing: news fixture', () => {
  const snap = load('snap-news.json')
  it('caps the list at 200 and says how many were left out', () => {
    const r = indexElements(snap)
    expect(MAX_ELEMENTS).toBe(200)
    expect(r.total).toBe(216)
    expect(r.cut).toBe(true)
    expect(r.elements).toHaveLength(200)
    expect(r.elements[199].name).toBe('Story 200 headline')
    expect(r.text.endsWith('(16 more not listed; scroll and call elements again)')).toBe(true)
  })
  it('leaves out hidden links', () => {
    expect(indexElements(snap).text).not.toContain('Hidden link')
  })
})

describe('element indexing: rules', () => {
  it('keeps an element whose top element is one of its descendants', () => {
    const snap: Snapshot = {
      nodes: [
        { id: 1, parent: null, tag: 'div', box: { x: 0, y: 0, w: 100, h: 100 } },
        { id: 2, parent: 1, tag: 'button', name: 'Inner', box: { x: 10, y: 10, w: 20, h: 20 }, topAt: 3 },
        { id: 3, parent: 2, tag: 'span', box: { x: 10, y: 10, w: 20, h: 20 } },
      ],
    }
    expect(indexElements(snap).lines).toEqual(['[1] button "Inner"'])
  })
  it('squashes whitespace and cuts long names', () => {
    const snap: Snapshot = {
      nodes: [{ id: 1, parent: null, tag: 'a', name: `  a\n\tb  ${'x'.repeat(200)}`, box: { x: 0, y: 0, w: 5, h: 5 } }],
    }
    const name = indexElements(snap).elements[0].name
    expect(name.startsWith('a b x')).toBe(true)
    expect(name.length).toBe(120)
  })
  it('maps roles from the accessibility role first, then tags', () => {
    expect(roleOf({ id: 1, parent: null, tag: 'div', role: 'menuitem', box: null })).toBe('menuitem')
    expect(roleOf({ id: 1, parent: null, tag: 'input', inputType: 'checkbox', box: null })).toBe('checkbox')
    expect(roleOf({ id: 1, parent: null, tag: 'input', box: null })).toBe('textbox')
  })
})
