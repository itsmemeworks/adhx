/**
 * Pure, dependency-free helpers for the dynamic sitemap (`src/app/sitemap.ts`).
 * No DB import here — keeps the gate/validation/week-math logic unit
 * testable in isolation from SQLite.
 */

/** Valid X/Twitter handle: 1-15 word characters, no leading "@". */
const TWITTER_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/

/** Whether a string is a syntactically valid X/Twitter handle. */
export function isValidTwitterHandle(handle: string | null | undefined): handle is string {
  return !!handle && TWITTER_HANDLE_RE.test(handle)
}

export interface ThinContentInput {
  /** The post has a thumbnail/photo/video attached. */
  hasMedia: boolean
  /** The post is an X Article. */
  isArticle: boolean
  /** Length of the post's text (post text, or article title as a fallback). */
  textLength: number
  /** The post was actually bookmarked by at least one user (not just previewed). */
  saved: boolean
}

/** Minimum text length (chars) for a text-only post to be considered substantial. */
export const THIN_CONTENT_TEXT_MIN = 80

/**
 * Thin-content quality gate for activity-derived preview URLs.
 *
 * A post earns a sitemap entry if ANY of: it carries media, it's an article,
 * its text clears {@link THIN_CONTENT_TEXT_MIN} chars, or it was actually
 * SAVED by someone (saved content is real user curation, not a drive-by
 * preview, regardless of how sparse the post itself is). Keeps a flood of
 * two-word previewed-but-never-saved posts from diluting site-wide quality
 * signals.
 */
export function passesThinContentGate(input: ThinContentInput): boolean {
  return (
    input.saved || input.hasMedia || input.isArticle || input.textLength >= THIN_CONTENT_TEXT_MIN
  )
}

/**
 * ISO-8601 week slug for a date, e.g. "2026-w30". Monday-start weeks; week 1
 * is the week containing January 4th (the ISO 8601 definition).
 */
export function isoWeekSlug(date: Date): string {
  // Normalize to a UTC midnight date so time-of-day can't shift the week.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // ISO day-of-week: Monday=0 .. Sunday=6.
  const dayNum = (d.getUTCDay() + 6) % 7
  // Shift to the Thursday of this ISO week — the year that Thursday falls in
  // is the ISO week-numbering year (handles the Dec-31/Jan-1 edge weeks).
  d.setUTCDate(d.getUTCDate() - dayNum + 3)

  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3)

  const weekNum =
    1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${d.getUTCFullYear()}-w${String(weekNum).padStart(2, '0')}`
}

/**
 * Distinct COMPLETED ISO week slugs represented in a list of timestamps
 * (ISO date/datetime strings), excluding the current in-progress week.
 * Returned newest-first.
 */
export function completedWeekSlugs(timestamps: string[], now: Date = new Date()): string[] {
  const currentWeek = isoWeekSlug(now)
  const weeks = new Set<string>()
  for (const ts of timestamps) {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) continue
    const slug = isoWeekSlug(d)
    if (slug === currentWeek) continue
    weeks.add(slug)
  }
  // Zero-padded "YYYY-wWW" slugs sort lexically in chronological order.
  return [...weeks].sort().reverse()
}
