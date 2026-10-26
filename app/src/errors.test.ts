import { describe, expect, it } from 'vitest'
import { clean, friendly } from './errors'

describe('friendly', () => {
  it('says the common failures plainly', () => {
    expect(friendly('GitHub answered 401 for /user/repos: Bad credentials')).toMatch(/^GitHub did not accept the token/)
    expect(friendly('Google Cloud: service: cloudresourcemanager.googleapis.com reason: CREDENTIALS_MISSING')).toBe('Google Cloud: not signed in on this Mac. Run gcloud auth login to see your projects.')
    expect(friendly('getaddrinfo ENOTFOUND api.github.com')).toMatch(/^No connection/)
  })
  it('keeps what it does not know, without the IPC wrapper', () => {
    expect(clean(new Error("Error invoking remote method 'x:y': Error: Docker is not running."))).toBe('Docker is not running.')
  })
})
