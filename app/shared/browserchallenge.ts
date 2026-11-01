// Classifies a page as a bot challenge or block: HTTP 403 or 429, the Cloudflare `cf-mitigated` header, a
// known challenge frame or form on the page, or a short interstitial that says "verify you are human". The
// result tells the agent to stop and hand the page to the person. A page that only talks about captchas
// (an article, a help page, a sign-up form that mentions one) is not a challenge: the word alone never stops
// a task. There is no retry path: this module returns a verdict and nothing that resends a request. Pure.

export type ChallengeInput = {
  status?: number
  headers?: Record<string, string>
  /** the visible text of the page (innerText), not the HTML */
  text?: string
  /** `src` of the iframes on the page */
  frames?: string[]
  /** markers of challenge widgets and forms found in the DOM (class names, ids, data attributes) */
  widgets?: string[]
}

export type ChallengeReason = 'http-403' | 'http-429' | 'cf-mitigated' | 'challenge-frame' | 'challenge-form' | 'visible-text'
export type ChallengeVerdict = { kind: 'none' } | { kind: 'blocked'; reason: ChallengeReason; stop: true; retry: false }

/** Frames served by the known challenge providers. */
const FRAME = [
  /(^|[/.])google\.com\/recaptcha\//i,
  /recaptcha\/(api2|enterprise)\/(anchor|bframe|challenge)/i,
  /(^|[/.])hcaptcha\.com\//i,
  /challenges\.cloudflare\.com\//i,
  /(^|[/.])arkoselabs\.com\//i,
  /(^|[/.])funcaptcha\.(com|co)\//i,
  /(^|[/.])geetest\.com\//i,
  /(^|[/.])captcha-delivery\.com\//i,
]

/** What the page script reports for a challenge widget or form. Plain widgets only; never the word in text. */
const WIDGET = /^(g-recaptcha|h-captcha|cf-turnstile|cf-challenge|challenge-form|challenge-stage|px-captcha|geetest_)/i

/** A challenge interstitial is a short page; a long page that quotes these words is content. */
const INTERSTITIAL_MAX_CHARS = 600
const VISIBLE = [
  /verify (that )?you are (a )?human/i,
  /are you a (human|robot)/i,
  /checking your browser before accessing/i,
  /press (and|&) hold to confirm/i,
  /unusual traffic from your (computer|network)/i,
]

export function classifyChallenge(input: ChallengeInput): ChallengeVerdict {
  const headers = input.headers ?? {}
  const cf = Object.entries(headers).find(([k]) => k.toLowerCase() === 'cf-mitigated')
  if (cf && cf[1].trim() !== '') return blocked('cf-mitigated')
  if (input.status === 403) return blocked('http-403')
  if (input.status === 429) return blocked('http-429')
  if ((input.frames ?? []).some((src) => FRAME.some((re) => re.test(src)))) return blocked('challenge-frame')
  if ((input.widgets ?? []).some((w) => WIDGET.test(w))) return blocked('challenge-form')
  const text = (input.text ?? '').trim()
  if (text.length <= INTERSTITIAL_MAX_CHARS && VISIBLE.some((re) => re.test(text))) return blocked('visible-text')
  return { kind: 'none' }
}

function blocked(reason: ChallengeReason): ChallengeVerdict {
  return { kind: 'blocked', reason, stop: true, retry: false }
}
