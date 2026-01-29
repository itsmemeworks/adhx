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
