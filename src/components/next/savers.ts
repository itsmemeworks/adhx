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

/** A friend's channel page. */
export function friendChannelHref(username: string): string {
  return `/channels/friend/${encodeURIComponent(username)}`
}

/** Where tapping a saver goes: their channel, or My saves for you. */
export function saverHref(saver: Saver): string {
  return saver.isYou ? '/play?recent=1' : friendChannelHref(saver.username)
}

/** "Ana’s saves", "Your saves". */
export function savesOf(saver: Pick<Saver, 'name' | 'username' | 'isYou'>): string {
  if (saver.isYou) return 'Your saves'
  return `${saver.name?.trim() || saver.username}’s saves`
}
