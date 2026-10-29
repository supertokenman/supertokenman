import { describe, expect, it } from 'vitest'
import { variantOf } from './variant'

describe('variantOf', () => {
  it('is the capability card with no overrides by default', () => expect(variantOf({}, false)).toEqual({ guide: 'card', terse: undefined, condense: undefined }))
  it('reads the three variables in development', () =>
    expect(variantOf({ STM_PROMPT_VARIANT: 'old', STM_TERSE: '1', STM_CONDENSE: '0' }, false)).toEqual({ guide: 'old', terse: true, condense: false }))
  it('ignores them in a packaged app', () => expect(variantOf({ STM_PROMPT_VARIANT: 'old', STM_TERSE: '1' }, true)).toEqual({ guide: 'card' }))
})
