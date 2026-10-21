/**
 * Plain times for Settings rows: "just now", "10 min ago", "2h ago",
 * "yesterday", "3 days ago"; and "expires in 7 days". No imports.
 */
export function agoLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const mins = Math.floor((now - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(mins)) return ''
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months <= 1 ? 'a month ago' : `${months} months ago`
}

export function expiresLabel(iso: string, now = Date.now()): string {
  const hours = (Date.parse(iso) - now) / 3_600_000
  if (hours >= 36) return `expires in ${Math.round(hours / 24)} days`
  if (hours >= 23.5) return 'expires in a day'
  const rounded = Math.max(1, Math.round(hours))
  return rounded === 1 ? 'expires in about an hour' : `expires in ${rounded} hours`
}
