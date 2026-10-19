import type { Saver } from '@/lib/people/types'

/**
 * Words for who saved a post, as members see it (savers come newest first).
 * Your own save reads "You" and leads.
 *
 * - "Ana saved this", "You saved this"
 * - "Ana and Ben saved this", "You and Ana saved this"
 * - "Ana and 3 others", "You and 2 others"
 */
export function saverName(saver: Saver): string {
  if (saver.isYou) return 'You'
  return saver.name?.trim() || saver.username
}

/** Savers with you first, then newest first. */
export function orderedSavers(savers: readonly Saver[]): Saver[] {
  const you = savers.filter((s) => s.isYou)
  return [...you, ...savers.filter((s) => !s.isYou)]
}

export function saversLine(savers: readonly Saver[]): string {
  const list = orderedSavers(savers)
  if (list.length === 0) return ''
  const [first, second] = list
  if (list.length === 1) return `${saverName(first)} saved this`
  if (list.length === 2) return `${saverName(first)} and ${saverName(second)} saved this`
  const others = list.length - 1
  return `${saverName(first)} and ${others} others`
}
