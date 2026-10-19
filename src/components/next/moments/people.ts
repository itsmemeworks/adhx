import type { Saver } from '@/lib/people/types'
import { hashSeed } from '@/lib/avatar/generated-avatar'
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

/** Bright colours with dark text on each, one per person (rings, reaction bubbles). */
const PERSON_COLOURS = [
  '#ff8fa3',
  '#7fd1ae',
  '#c4a7ff',
  '#ffb35c',
  '#86c2ff',
  '#ffd23f',
  '#7fe3d6',
  '#d6e36b',
] as const

/** A member's colour: the same on every screen, from their username. */
export function personColour(username: string): string {
  return PERSON_COLOURS[hashSeed(username) % PERSON_COLOURS.length]
}
