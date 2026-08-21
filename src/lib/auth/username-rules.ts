/**
 * Pure username grammar/limit constants — deliberately free of any server
 * dependency (no `@/lib/db`, no `better-sqlite3`) so both server code
 * (`src/lib/auth/account.ts`) and client components (the shared
 * `UsernameChooser`) can import it directly without pulling the DB layer
 * into the client bundle.
 */

/**
 * How many times an account may change its username after the first free
 * claim. The first claim (`/welcome`, or the claim affordance in Settings
 * for pre-existing accounts) never counts against this — see
 * `chooseUsername()` in `src/lib/auth/account.ts`.
 */
export const MAX_USERNAME_CHANGES = 2

/**
 * Public username grammar: lowercase `[a-z0-9_-]`, must start alphanumeric,
 * capped at 15 chars. Used by the username chooser's live availability
 * check and server-side validation — the single normalizer so client
 * preview and server validation never disagree.
 */
export function sanitizeUsername(raw: string): string {
  const stripped = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const startsAlnum = stripped.replace(/^[-_]+/, '')
  return startsAlnum.slice(0, 15)
}
