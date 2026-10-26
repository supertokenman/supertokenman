import { describe, expect, it } from 'vitest'
import { CATALOG, googleClient } from './integrations'

describe('Google integrations', () => {
  it('reads the client ID and secret, separated by a space or a colon', () => {
    expect(googleClient('123.apps.googleusercontent.com GOCSPX-abc')).toEqual({ GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'GOCSPX-abc' })
    expect(googleClient(' id:sec ')).toEqual({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec' })
  })
  it('keeps the secret out of the command line', () => {
    for (const id of ['gmail', 'google-drive']) {
      const cfg = CATALOG.find((c) => c.id === id)!.config('cid GOCSPX-secret') as { args: string[]; env: Record<string, string> }
      expect(cfg.args.join(' ')).not.toContain('GOCSPX-secret')
      expect(cfg.args.join(' ')).toContain('${GOOGLE_CLIENT_SECRET}')
      expect(cfg.env.GOOGLE_CLIENT_SECRET).toBe('GOCSPX-secret')
    }
  })
})
