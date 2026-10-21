import { hashSeed } from '@/lib/avatar/generated-avatar'

/**
 * A member's face when they have no photo: their initial, black at weight
 * 800, on one of the boards' five colours, in Gob's shape (`NxAvatar`).
 * The same person gets the same colour on web, iOS and Android:
 *
 *   index = FNV-1a 32-bit (offset 0x811c9dc5, prime 0x01000193) over the
 *           UTF-16 code units of the username, lowercased, without a leading
 *           "@" — then `index % 5` into FACE_COLOURS, in this order.
 *
 * (In this order the boards' people land on their board colours: Ana pink,
 * Ben green, Mum orange, Jo purple, Pete blue.)
 */
export const FACE_COLOURS = ['#7fd1ae', '#ff8fa3', '#6b8cff', '#c4a7ff', '#ffb35c'] as const

function faceKey(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase()
}

/** The colour behind a member's initial, from their username. */
export function faceColour(username: string): string {
  return FACE_COLOURS[hashSeed(faceKey(username)) % FACE_COLOURS.length]
}

/** The letter on a face: the name's first letter ("You" reads as the username's). */
export function faceInitial(name: string | null | undefined, username: string): string {
  const source = name && name.trim() && name.trim() !== 'You' ? name.trim() : faceKey(username)
  const first = Array.from(source.replace(/^@/, ''))[0] ?? '?'
  return first.toLocaleUpperCase('en-GB')
}
