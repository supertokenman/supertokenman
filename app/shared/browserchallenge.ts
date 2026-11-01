// Classifies a page as a bot challenge or block: HTTP 403 or 429, the Cloudflare `cf-mitigated` header, or
// visible "verify you are human" text. The result tells the agent to stop and hand the page to the person.
// There is no retry path: this module returns a verdict and nothing that resends a request. Pure.

export type ChallengeInput = {
  status?: number
  headers?: Record<string, string>
  /** the visible text of the page (innerText), not the HTML */
  text?: string
}

export type ChallengeVerdict =
  | { kind: 'none' }
  | { kind: 'blocked'; reason: 'http-403' | 'http-429' | 'cf-mitigated' | 'visible-text'; stop: true; retry: false }

const VISIBLE = [
  /verify (that )?you are (a )?human/i,
  /are you a (human|robot)/i,
  /checking your browser before accessing/i,
  /press (and|&) hold to confirm/i,
  /unusual traffic from your (computer|network)/i,
  /complete the (security )?captcha/i,
  /\bcaptcha\b/i,
]

export function classifyChallenge(input: ChallengeInput): ChallengeVerdict {
  const headers = input.headers ?? {}
  const cf = Object.entries(headers).find(([k]) => k.toLowerCase() === 'cf-mitigated')
  if (cf && cf[1].trim() !== '') return blocked('cf-mitigated')
  if (input.status === 403) return blocked('http-403')
  if (input.status === 429) return blocked('http-429')
  const text = input.text ?? ''
  if (VISIBLE.some((re) => re.test(text))) return blocked('visible-text')
  return { kind: 'none' }
}

function blocked(reason: 'http-403' | 'http-429' | 'cf-mitigated' | 'visible-text'): ChallengeVerdict {
  return { kind: 'blocked', reason, stop: true, retry: false }
}
