// Evergreen candidates: posts already sent that are old enough, in the top engagement quartile of their
// network, and free of time-bound words. Pure: no I/O, no Claude. Haiku writes the wording afterwards.

export type EvergreenInput = { id: string; text: string; at: number; engagement?: number }

const DAY = 86_400_000
export const MIN_AGE_DAYS = 30

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const TIME_BOUND: RegExp[] = [
  // relative time, English, Portuguese, Spanish
  /\b(today|tomorrow|yesterday|tonight|this (week|weekend|month|year|morning|afternoon|evening)|next (week|month|year)|right now|now live|coming soon|launch(es|ing|ed)?)\b/i,
  /\b(hoje|amanh[ãa]|ontem|esta semana|este m[êe]s|esse m[êe]s|lan[çc]amento)\b/i,
  /\b(hoy|ma[ñn]ana|ayer|esta semana|este mes|lanzamiento)\b/i,
  // dates: ISO, numeric, "29 Oct", "Oct 29", "October 2026", bare years
  /\b\d{4}-\d{1,2}-\d{1,2}\b/,
  /\b\d{1,2}[/.-]\d{1,2}[/.-](\d{2}|\d{4})\b/,
  new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+(de\\s+)?${MONTH}\\b`, 'i'),
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(st|nd|rd|th)?\\b`, 'i'),
  new RegExp(`\\b${MONTH}\\.?\\s+(de\\s+)?\\d{4}\\b`, 'i'),
  /\b(19|20)\d{2}\b/,
  // version numbers: v1.2, 1.2.3, "version 2"
  /\bv\d+(\.\d+)+\b/i,
  /\b\d+\.\d+\.\d+\b/,
  /\bversion\s+\d/i,
]

/** True when the text says something that goes stale: a date, a day, a version, a launch. */
export function isTimeBound(text: string): boolean {
  return TIME_BOUND.some((re) => re.test(text))
}

/**
 * Candidates for recycling, ranked by engagement (highest first, ties by older post first, then id).
 * `posts` is one network's sent posts; the quartile is taken over all of them that report engagement.
 * Posts without engagement, younger than MIN_AGE_DAYS, outside the top quartile or time-bound are dropped.
 */
export function evergreenCandidates<T extends EvergreenInput>(posts: T[], now: number, minAgeDays = MIN_AGE_DAYS): T[] {
  const measured = posts.filter((p) => typeof p.engagement === 'number' && p.engagement > 0)
  if (!measured.length) return []
  const desc = measured.map((p) => p.engagement!).sort((a, b) => b - a)
  const cutoff = desc[Math.ceil(measured.length / 4) - 1]!
  const oldBefore = now - minAgeDays * DAY
  return measured
    .filter((p) => p.at < oldBefore && p.engagement! >= cutoff && !isTimeBound(p.text))
    .sort((a, b) => b.engagement! - a.engagement! || a.at - b.at || a.id.localeCompare(b.id))
}
