/**
 * Formatting utilities for display values
 */

/**
 * Format large numbers with K/M suffix for compact display
 * @example formatCount(1500) // "1.5K"
 * @example formatCount(1500000) // "1.5M"
 */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

/**
 * Format a date as relative time from now
 * @example formatRelativeTime('2024-01-10T12:00:00Z') // "3d ago"
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

/**
 * Truncate text to a max length, adding ellipsis if needed
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1).trim() + '\u2026'
}

/**
 * Whether an ISO timestamp is a real, displayable post date. Platforms that
 * don't expose an original post date (Instagram saves) store a null
 * `createdAt` that seed mappers backfill with an epoch sentinel — rendering
 * that as "56y" is worse than showing no time at all (owner report, the
 * collection theater). Unparseable values, or anything before 2006 (nothing
 * in the app predates Twitter), read as unknown.
 */
export function hasKnownTimestamp(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const t = new Date(dateStr).getTime()
  return Number.isFinite(t) && t >= Date.UTC(2006, 0, 1)
}

/**
 * Long-form relative time, for tooltips and accessible labels where an
 * abbreviation is no help. Same buckets as `formatCompactRelativeTime`, so
 * "3w" and "3 weeks ago" can never disagree.
 *
 * @example formatVerboseRelativeTime('2024-01-10T12:00:00Z') // "3 weeks ago"
 */
export function formatVerboseRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60_000)
  const hours = Math.floor(diffMs / 3_600_000)
  const days = Math.floor(diffMs / 86_400_000)
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`

  if (mins < 1) return 'just now'
  if (mins < 60) return plural(mins, 'minute')
  if (hours < 24) return plural(hours, 'hour')
  if (days < 7) return plural(days, 'day')
  if (days < 30) return plural(Math.floor(days / 7), 'week')
  if (days < 365) return plural(Math.floor(days / 30), 'month')
  return plural(Math.floor(days / 365), 'year')
}

/**
 * The label for an "added to ADHX" time chip.
 *
 * Everywhere else on the internet a bare relative time beside a post means the
 * POST's age, so the chip has to say WHICH time it is or it gets misread —
 * owner report: a post first linked three weeks ago showed "3w" and read as a
 * three-week-old post. The chip keeps the compact value; this is what goes in
 * its `title`/`aria-label`.
 */
export function addedToAdhxLabel(dateStr: string): string {
  return `Added to ADHX ${formatVerboseRelativeTime(dateStr)}`
}

/**
 * Format a date as compact relative time (no "ago" suffix)
 * @example formatCompactRelativeTime('2024-01-10T12:00:00Z') // "5d"
 */
export function formatCompactRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
  return `${Math.floor(diffDays / 365)}y`
}

/**
 * Format duration in milliseconds to MM:SS format
 * @example formatDurationMs(125000) // "2:05"
 * @example formatDurationMs(65000) // "1:05"
 * @example formatDurationMs(null) // null
 */
export function formatDurationMs(ms: number | null | undefined): string | null {
  if (!ms) return null
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
