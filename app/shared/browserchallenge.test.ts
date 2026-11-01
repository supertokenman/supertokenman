import { describe, expect, it } from 'vitest'
import * as mod from './browserchallenge'
import { classifyChallenge } from './browserchallenge'

describe('challenge classifier', () => {
  it('classifies 403 and 429 as blocked, to stop', () => {
    expect(classifyChallenge({ status: 403 })).toEqual({ kind: 'blocked', reason: 'http-403', stop: true, retry: false })
    expect(classifyChallenge({ status: 429 })).toEqual({ kind: 'blocked', reason: 'http-429', stop: true, retry: false })
  })
  it('classifies the cf-mitigated header whatever its case, and an empty one not at all', () => {
    expect(classifyChallenge({ status: 200, headers: { 'CF-Mitigated': 'challenge' } })).toMatchObject({ reason: 'cf-mitigated' })
    expect(classifyChallenge({ status: 200, headers: { 'cf-mitigated': '' } })).toEqual({ kind: 'none' })
  })
  it('classifies visible challenge text, case-insensitively', () => {
    expect(classifyChallenge({ status: 200, text: 'Please Verify you are human to continue' })).toMatchObject({ reason: 'visible-text' })
    expect(classifyChallenge({ status: 200, text: 'Press & hold to confirm you are a human' })).toMatchObject({ reason: 'visible-text' })
    expect(classifyChallenge({ status: 200, text: 'Checking your browser before accessing the site' })).toMatchObject({ reason: 'visible-text' })
  })
  it('lets an ordinary page through', () => {
    expect(classifyChallenge({ status: 200, headers: { 'content-type': 'text/html' }, text: 'Welcome, the store is open.' })).toEqual({ kind: 'none' })
    expect(classifyChallenge({})).toEqual({ kind: 'none' })
  })
  it('has no retry path: the module exports only the classifier and its types', () => {
    expect(Object.keys(mod).sort()).toEqual(['classifyChallenge'])
  })
})
