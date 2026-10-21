import { faceColour } from '../faces'
import type { Saver } from '@/lib/people/types'
import { orderedSavers, saverName } from '../savers'

/**
 * Words for live moments with names (members only; strangers never get
 * `savers` or `watchers`, so these never run for them).
 *
 * - "Ana, Ben and Jo are saving these", "You and Ana are saving these"
 * - "Ana and Ben are watching", "Ana and Ben are watching with you"
 * - "Tune in with Ana", "Jo just saved one"
 */

/** "Ana", "Ana and Ben", "Ana, Ben and Jo", "Ana, Ben and 3 others". */
export function namesOf(names: readonly string[], total = names.length): string {
  const all = Math.max(total, names.length)
  if (all === 0) return ''
  // Three names read fine; past that, name two and count the rest.
  const shown = all <= 3 ? names.slice(0, all) : names.slice(0, 2)
  const others = all - shown.length
  if (others > 0) {
    return `${shown.join(', ')} and ${others === 1 ? '1 other' : `${others} others`}`
  }
  if (shown.length === 1) return shown[0]
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

function verb(list: readonly Saver[], total: number): 'is' | 'are' {
  return total === 1 && !list[0]?.isYou ? 'is' : 'are'
}

/** Who is saving a moment's posts. `people` is the full count (more than the faces sent). */
export function savingLine(savers: readonly Saver[], people = savers.length): string {
  if (savers.length === 0) return ''
  const list = orderedSavers(savers)
  const total = Math.max(people, list.length)
  return `${namesOf(list.map(saverName), total)} ${verb(list, total)} saving these`
}

/** Who else is tuned in: "Ana and Ben are watching". */
export function watchingLine(watchers: readonly Saver[], withYou = false): string {
  if (watchers.length === 0) return ''
  const names = namesOf(watchers.map(saverName))
  return `${names} ${verb(watchers, watchers.length)} watching${withYou ? ' with you' : ''}`
}

/** The Tune in button: "Tune in with Ana" when a friend is already watching. */
export function tuneInLabel(watchers: readonly Saver[] | undefined): string {
  const first = watchers?.find((w) => !w.isYou)
  return first ? `Tune in with ${saverName(first)}` : 'Tune in'
}

/** The arriving-save toast: "Jo just saved one". */
export function arrivalLine(saver: Saver): string {
  return `${saverName(saver)} just saved one`
}

/** A member's colour on every screen (rings, reaction bubbles): their face's colour. */
export function personColour(username: string): string {
  return faceColour(username)
}

/**
 * "3 saves in 10 min" from a moment's recent figure (members only), or null
 * when there's none or nothing landed lately.
 */
export function recentLine(moment: {
  recentSaves?: number
  windowMinutes?: number
}): string | null {
  const n = moment.recentSaves ?? 0
  if (n <= 0 || !moment.windowMinutes) return null
  return `${n.toLocaleString('en-GB')} ${n === 1 ? 'save' : 'saves'} in ${moment.windowMinutes} min`
}
