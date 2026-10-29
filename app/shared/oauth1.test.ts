import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { authHeader, baseString } from './oauth1'

const hmac = (k: string, t: string) => createHmac('sha1', k).update(t).digest('base64')

// X's "Creating a signature" documentation example
const keys = {
  consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
  consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
  token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
  tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
}
const url = 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true'
const o = { nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: 1318622958, form: { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' } }

describe('oauth1', () => {
  it('builds the base string of the X docs example', () => {
    const b = baseString('post', url, { oauth_consumer_key: keys.consumerKey, oauth_nonce: o.nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: '1318622958', oauth_token: keys.token, oauth_version: '1.0', ...o.form })
    expect(b.startsWith('POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26oauth_consumer_key')).toBe(true)
    expect(b).toContain('status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521')
  })
  it('signs the RFC 5849 section 1.2 example to its published signature', () => {
    // that example has no oauth_version, so the base string is built from its exact params
    const b = baseString('GET', 'http://photos.example.net/photos?file=vacation.jpg&size=original', { oauth_consumer_key: 'dpf43f3p2l4k3l03', oauth_token: 'nnch734d00sl2jdk', oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: '137131202', oauth_nonce: 'chapoH' })
    expect(hmac('kd94hf93k423kf44&pfkkdhi9sl3r4s00', b)).toBe('MdpQcU8iPSUjWoN/UDMsK2sui9I=')
  })
  it('puts the documented X example fields in the header', () => {
    const h = authHeader('POST', url, keys, hmac, o)
    expect(h.startsWith('OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog", oauth_nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", oauth_signature="')).toBe(true)
    expect(h).toContain('oauth_signature_method="HMAC-SHA1", oauth_timestamp="1318622958"')
  })
  it('signs the X docs example to its published signature', () => {
    expect(authHeader('POST', url, keys, hmac, o)).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"')
  })
})
