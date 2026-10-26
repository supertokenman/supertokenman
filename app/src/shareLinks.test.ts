import { describe, expect, it } from 'vitest'
import { lengthOn, NETWORKS } from '../shared/publish'

const n = (id: string) => NETWORKS.find((x) => x.id === id)!

describe('publish', () => {
  it('fills each share page', () => {
    expect(n('x').intent('Shipped it', 'https://a.dev')).toBe('https://x.com/intent/post?text=Shipped%20it&url=https%3A%2F%2Fa.dev')
    expect(n('bluesky').intent('hi')).toBe('https://bsky.app/intent/compose?text=hi')
    expect(n('reddit').intent('Title line\nbody here')).toBe('https://www.reddit.com/submit?type=TEXT&title=Title%20line&text=body%20here')
    expect(n('linkedin').intent('a', 'https://b.dev')).toContain('text=a%0A%0Ahttps%3A%2F%2Fb.dev')
  })
  it('counts like the network does', () => {
    expect(lengthOn(n('x'), 'see https://example.com/a/very/long/path/that/is/long')).toBe(4 + 23)
    expect(lengthOn(n('bluesky'), 'olá')).toBe(3)
  })
})
