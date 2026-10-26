import { describe, expect, it } from 'vitest'
import { framed, htmlOf, readAsk, uiUriOf } from './mcpapps'

describe('uiUriOf', () => {
  it('reads the ui resource from both meta shapes', () => {
    expect(uiUriOf({ _meta: { ui: { resourceUri: 'ui://w/chart' } } })).toBe('ui://w/chart')
    expect(uiUriOf({ _meta: { 'ui/resourceUri': 'ui://w/x' } })).toBe('ui://w/x')
    expect(uiUriOf({ _meta: { ui: { resourceUri: 'https://evil' } } })).toBeNull()
    expect(uiUriOf({})).toBeNull()
  })
})

describe('htmlOf', () => {
  it('takes text or a base64 blob, html only', () => {
    expect(htmlOf({ contents: [{ mimeType: 'text/html;profile=mcp-app', text: '<p>a</p>' }] })).toBe('<p>a</p>')
    expect(htmlOf({ contents: [{ mimeType: 'text/html', blob: btoa('<b>x</b>') }] })).toBe('<b>x</b>')
    expect(htmlOf({ contents: [{ mimeType: 'image/png', blob: 'AA==' }] })).toBeNull()
  })
})

describe('framed', () => {
  it('puts the CSP first in the head', () => {
    expect(framed('<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head></html>')).toMatch(/^<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'/)
    expect(framed('<p>hi</p>')).toContain("connect-src 'none'")
    expect(framed('<html lang="en"><body>x</body></html>')).toMatch(/<html lang="en"><head><meta/)
  })
})

describe('readAsk', () => {
  const tools = ['get_chart', 'save']
  it('allows calls to tools of the same server only', () => {
    expect(readAsk({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'save', arguments: { a: 1 } } }, tools)).toEqual({ kind: 'call', id: 1, name: 'save', args: { a: 1 } })
    expect(readAsk({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'rm_rf' } }, tools)).toMatchObject({ kind: 'refuse', id: 2 })
  })
  it('links must be https', () => {
    expect(readAsk({ jsonrpc: '2.0', id: 3, method: 'ui/open-link', params: { url: 'https://a.b' } }, tools)).toEqual({ kind: 'link', id: 3, url: 'https://a.b' })
    expect(readAsk({ jsonrpc: '2.0', id: 4, method: 'ui/open-link', params: { url: 'file:///etc/passwd' } }, tools).kind).toBe('refuse')
  })
  it('clamps size and ignores junk', () => {
    expect(readAsk({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 99999 } }, tools)).toEqual({ kind: 'size', height: 2000 })
    expect(readAsk('hello', tools).kind).toBe('ignore')
    expect(readAsk({ jsonrpc: '2.0', id: 5, method: 'resources/read' }, tools)).toMatchObject({ kind: 'refuse' })
    expect(readAsk({ jsonrpc: '2.0', id: 6, method: 'ui/message', params: { content: [{ type: 'text', text: 'hi' }] } }, tools)).toEqual({ kind: 'message', id: 6, text: 'hi' })
  })
})
