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
  it('does not stop a page that only mentions captcha in its text', () => {
    expect(classifyChallenge({ status: 200, text: 'Our captcha guide: how a captcha works and why sites show a captcha.' })).toEqual({ kind: 'none' })
    expect(classifyChallenge({ status: 200, text: 'Please complete the captcha on the next screen. ' + 'Order summary and shipping. '.repeat(40) })).toEqual({ kind: 'none' })
    expect(classifyChallenge({ status: 200, text: 'Sign up. We may ask you to verify you are human. ' + 'Plans and prices. '.repeat(60) })).toEqual({ kind: 'none' })
  })
  it('stops on a known challenge frame, whatever the text says', () => {
    expect(classifyChallenge({ status: 200, text: 'Welcome', frames: ['https://www.google.com/recaptcha/api2/anchor?k=x'] })).toMatchObject({ reason: 'challenge-frame' })
    expect(classifyChallenge({ status: 200, frames: ['https://newassets.hcaptcha.com/captcha/v1/static/hcaptcha.html'] })).toMatchObject({ reason: 'challenge-frame' })
    expect(classifyChallenge({ status: 200, frames: ['https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/x'] })).toMatchObject({ reason: 'challenge-frame' })
  })
  it('does not stop on an ordinary frame or one whose address only contains the word', () => {
    expect(classifyChallenge({ status: 200, frames: ['https://www.youtube.com/embed/abc', 'https://example.com/blog/what-is-a-recaptcha-frame'] })).toEqual({ kind: 'none' })
  })
  it('stops on a known challenge widget or form marker', () => {
    expect(classifyChallenge({ status: 200, widgets: ['cf-turnstile'] })).toMatchObject({ reason: 'challenge-form' })
    expect(classifyChallenge({ status: 200, widgets: ['challenge-form'] })).toMatchObject({ reason: 'challenge-form' })
    expect(classifyChallenge({ status: 200, widgets: ['product-card', 'captcha-article'] })).toEqual({ kind: 'none' })
  })
  it('lets an ordinary page through', () => {
    expect(classifyChallenge({ status: 200, headers: { 'content-type': 'text/html' }, text: 'Welcome, the store is open.' })).toEqual({ kind: 'none' })
    expect(classifyChallenge({})).toEqual({ kind: 'none' })
  })
  it('has no retry path: the module exports only the classifier and its types', () => {
    expect(Object.keys(mod).sort()).toEqual(['classifyChallenge'])
  })
})
