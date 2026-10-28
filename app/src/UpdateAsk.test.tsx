import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { answer, shouldAsk, UpdateAsk, UpdateAskCard, UPDATE_ASK } from './UpdateAsk'

const fake = (setting: boolean | undefined) => {
  let v = setting
  return {
    updateAsked: vi.fn(async () => typeof v === 'boolean'),
    updateAuto: vi.fn(async (on?: boolean) => {
      if (typeof on === 'boolean') v = on
      return v === true
    }),
    updateCheck: vi.fn(async () => ({ behind: 0, source: null })),
    get value() {
      return v
    },
  }
}

beforeEach(() => {
  ;(globalThis as { window?: unknown }).window = { dispatchEvent: vi.fn() }
})

describe('first-run update question', () => {
  it('shows while the setting is unset', async () => {
    expect(await shouldAsk(fake(undefined), true)).toBe(true)
  })
  it('never shows once answered either way', async () => {
    expect(await shouldAsk(fake(true), true)).toBe(false)
    expect(await shouldAsk(fake(false), true)).toBe(false)
  })
  it('never shows before the app is ready (splash, Tour)', async () => {
    const s = fake(undefined)
    expect(await shouldAsk(s, false)).toBe(false)
    expect(s.updateAsked).not.toHaveBeenCalled()
  })
  it('does not show if the question cannot be read', async () => {
    expect(await shouldAsk({ updateAsked: () => Promise.reject(new Error('x')), updateAuto: async () => false }, true)).toBe(false)
  })
  it('Check for updates saves true, Not now saves false, and the question is gone', async () => {
    const a = fake(undefined)
    expect(await answer(a, true)).toBe(true)
    expect(a.value).toBe(true)
    expect(await shouldAsk(a, true)).toBe(false)
    const b = fake(undefined)
    expect(await answer(b, false)).toBe(false)
    expect(b.value).toBe(false)
    expect(await shouldAsk(b, true)).toBe(false)
  })
  it('showing the card calls nothing on the updater', async () => {
    const s = fake(undefined)
    ;(globalThis as { window?: unknown }).window = { stm: s, dispatchEvent: vi.fn() }
    renderToStaticMarkup(<UpdateAsk ready />)
    renderToStaticMarkup(<UpdateAskCard onYes={() => undefined} onNo={() => undefined} />)
    expect(await shouldAsk(s, true)).toBe(true)
    expect(s.updateCheck).not.toHaveBeenCalled()
    expect(s.updateAuto).not.toHaveBeenCalled()
  })
  it('only Check for updates asks for the check', async () => {
    const dispatch = vi.fn()
    ;(globalThis as { window?: unknown }).window = { dispatchEvent: dispatch }
    await answer(fake(undefined), false)
    expect(dispatch).not.toHaveBeenCalled()
    await answer(fake(undefined), true)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
  it('says what the updater does: every 6 hours, nothing downloads on its own', () => {
    const html = renderToStaticMarkup(<UpdateAskCard onYes={() => undefined} onNo={() => undefined} />)
    expect(html).toContain('every 6 hours')
    expect(html).toContain('Nothing downloads until you choose Install')
    expect(html).toContain(UPDATE_ASK.where.replace('>', '&gt;'))
    expect(html).not.toMatch(/autofocus/i)
  })
})
