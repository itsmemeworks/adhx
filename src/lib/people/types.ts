/**
 * Shapes shared by the server helpers (`savers.ts`, `members.ts`) and the
 * client. No imports, so client components can use them freely.
 */

/** One person who saved a post, as shown to another member. Never sent to a signed-out viewer. */
export type Saver = {
  username: string
  name: string | null
  /** Their chosen photo; null when they use the generated icon (render it from `username`). */
  avatarUrl: string | null
  /** When they saved it (ISO). */
  savedAt: string
  isYou: boolean
  /**
   * Their note on this save ("making this Sunday"), when they left one. Members
   * only, like the rest of `Saver`; a private save's note reaches its owner alone.
   */
  note?: string
}
