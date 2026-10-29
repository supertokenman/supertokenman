// Mention pre-filters: cheap checks that skip Claude. Pure: no I/O, no Electron, no React.

export type Skip = 'muted' | 'link only' | 'repeated characters' | 'spam phrase'

/** Known spam phrases, lowercase. Kept short on purpose; a miss only means Claude sees the mention. */
export const SPAM_PHRASES = [
  'crypto giveaway', 'free bitcoin', 'double your', 'guaranteed returns', 'guaranteed profit',
  'make money fast', 'earn $', 'send me your wallet', 'seed phrase', 'claim your airdrop', 'free airdrop',
  'click here to claim', 'dm me for', 'telegram me', 'whatsapp me', 'buy followers', 'free followers',
  'investment opportunity', 'limited offer', 'casino',
]

/** Normalise a handle: no leading @, lowercase, trimmed. Mastodon's user@host keeps the host part. */
export const normHandle = (h: string) => h.trim().replace(/^@+/, '').toLowerCase()

const URL_RE = /(https?:\/\/|www\.)\S+/gi
const REPEAT_RE = /(\p{L}|\p{N}|\p{P}|\p{S})\1{7,}/u

/** The reason a mention skips Claude, or null when it should go to triage. */
export function preFilter(m: { author: string; text: string }, muted: readonly string[] = []): Skip | null {
  const who = normHandle(m.author)
  if (who && muted.some((h) => normHandle(h) === who)) return 'muted'

  const text = m.text
  if (/\S/.test(text) && URL_RE.test(text)) {
    URL_RE.lastIndex = 0
    const words = text.replace(URL_RE, ' ').replace(/[@#]\S+/g, ' ').replace(/[^\p{L}]+/gu, '')
    if (words.length < 4) return 'link only'
  }
  URL_RE.lastIndex = 0

  if (REPEAT_RE.test(text)) return 'repeated characters'

  const low = text.toLowerCase()
  if (SPAM_PHRASES.some((p) => low.includes(p))) return 'spam phrase'
  return null
}
