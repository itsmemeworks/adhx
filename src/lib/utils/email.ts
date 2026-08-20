/**
 * Linear-time email shape check (no backtrackable regex — an ambiguous
 * quantifier pattern here was flagged as polynomial ReDoS by CodeQL, and the
 * sign-in request route is unauthenticated). This is deliberately a *shape*
 * check, not RFC validation: one '@' with non-empty local part, a domain
 * containing an interior dot, no whitespace, and a sane length cap.
 */
export function isValidEmail(email: string): boolean {
  if (email.length < 3 || email.length > 254) return false
  if (/\s/.test(email)) return false
  const at = email.indexOf('@')
  if (at <= 0 || at !== email.lastIndexOf('@')) return false
  const domain = email.slice(at + 1)
  const lastDot = domain.lastIndexOf('.')
  return lastDot > 0 && lastDot < domain.length - 1
}
