import crypto from 'crypto'
import { db, runInTransaction } from '@/lib/db'
import {
  users,
  userIdentities,
  loginTokens,
  oauthTokens,
  oauthState,
  usernameAliases,
} from '@/lib/db/schema'
import { and, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm'
import { MAX_USERNAME_CHANGES, sanitizeUsername } from './username-rules'

export { MAX_USERNAME_CHANGES, sanitizeUsername }

const TOKEN_TTL_MS = 15 * 60 * 1000
const MAX_EMAIL_CLAIM_ATTEMPTS = 100

// ===========================================
// Account read model
// ===========================================

export interface AccountIdentities {
  x: { providerId: string; username?: string; avatarUrl?: string | null } | null
  email: { email: string } | null
}

export interface Account {
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    email: string | null
    usernameChosen: boolean
    usernameChangeCount: number
  }
  identities: AccountIdentities
  xConnected: boolean
}

/**
 * Read the full account view for a userId: the `users` row, its linked
 * identities, and whether an X (Twitter) connection is currently stored.
 * Returns null if the account no longer exists. Callers must treat that as
 * signed out; recreating from a JWT would resurrect a deleted account.
 */
export async function getAccount(userId: string): Promise<Account | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return null

  const identityRows = await db
    .select()
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId))

  const xIdentity = identityRows.find((row) => row.provider === 'x') ?? null
  const emailIdentity = identityRows.find((row) => row.provider === 'email') ?? null

  const [tokenRow] = await db
    .select({ username: oauthTokens.username, profileImageUrl: oauthTokens.profileImageUrl })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .limit(1)

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      email: user.email,
      usernameChosen: !!user.usernameChosen,
      usernameChangeCount: user.usernameChangeCount,
    },
    identities: {
      x: xIdentity
        ? {
            providerId: xIdentity.providerId,
            username: tokenRow?.username ?? undefined,
            avatarUrl: tokenRow?.profileImageUrl ?? user.avatarUrl ?? null,
          }
        : null,
      email: emailIdentity ? { email: emailIdentity.providerId } : null,
    },
    xConnected: !!tokenRow,
  }
}

// ===========================================
// Username helpers
// ===========================================

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex')
}

/**
 * True if `username` is already taken — either as another account's current
 * username, or as a redirect alias for a username another account changed
 * away from. `excludeUserId` lets a user check/re-claim their own current
 * username, or reclaim their OWN past username (freeing its alias), without
 * either reading as taken.
 */
export async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  if (userRow) return userRow.id !== excludeUserId

  const [aliasRow] = await db
    .select({ userId: usernameAliases.userId })
    .from(usernameAliases)
    .where(eq(usernameAliases.username, username))
    .limit(1)
  if (aliasRow) return aliasRow.userId !== excludeUserId

  return false
}

function sanitizeLocalPart(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  const cleaned = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 15)
  return cleaned || 'reader'
}

export type ChooseUsernameResult =
  | { ok: true; username: string; changesRemaining: number }
  | { error: 'taken' | 'invalid' | 'change_limit_reached' }

/**
 * Claim or change a username. Used by `POST /api/auth/username` both for
 * the `/welcome` first-claim prompt and for changes from Settings.
 *
 * - **First claim** (`usernameChosen` false — a brand-new email account at
 *   `/welcome`, or a pre-existing account claiming for the first time from
 *   Settings) is free: it doesn't count against `MAX_USERNAME_CHANGES` and
 *   doesn't create a redirect alias for the old (auto-derived) name, since
 *   that name was never really chosen and shouldn't be locked to the
 *   account forever.
 * - **Every subsequent change** costs one of `MAX_USERNAME_CHANGES` (2).
 *   Once spent, the old username is recorded in `username_aliases` so
 *   existing `/t/{username}/...` links keep resolving via a permanent
 *   redirect — see `src/lib/users/lookup.ts`.
 * - **Resubmitting the current username** is always a free no-op (common
 *   when a user opens the chooser and just confirms) — it works even after
 *   the change cap is reached.
 * - **Reclaiming one of the caller's own past usernames** is exempt from the
 *   general "taken" check (an alias you own never blocks you) and frees
 *   that alias row, since the name is becoming the caller's real username
 *   again. It's still a change like any other, though — it costs one of
 *   `MAX_USERNAME_CHANGES` and is still rejected once the cap is spent.
 *
 * All mutations (the alias insert/delete + the `users` row update) happen
 * inside one `runInTransaction()` so a change can never be spent twice, and
 * a crash mid-change can never leave a name aliased with no real owner.
 */
export async function chooseUsername(userId: string, raw: string): Promise<ChooseUsernameResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return { error: 'invalid' }

  const username = sanitizeUsername(raw)
  if (username.length < 3 || username.length > 15) {
    return { error: 'invalid' }
  }

  const isFirstClaim = !user.usernameChosen

  if (!isFirstClaim && username === user.username) {
    return { ok: true, username, changesRemaining: MAX_USERNAME_CHANGES - user.usernameChangeCount }
  }

  if (!isFirstClaim && user.usernameChangeCount >= MAX_USERNAME_CHANGES) {
    return { error: 'change_limit_reached' }
  }

  if (await isUsernameTaken(username, userId)) {
    return { error: 'taken' }
  }

  const oldUsername = user.username
  const newChangeCount = isFirstClaim ? user.usernameChangeCount : user.usernameChangeCount + 1

  runInTransaction(() => {
    // Reclaiming one of the caller's own past usernames frees that alias —
    // it's becoming the real username again, so the redirect is moot.
    db.delete(usernameAliases)
      .where(and(eq(usernameAliases.username, username), eq(usernameAliases.userId, userId)))
      .run()

    if (oldUsername && oldUsername !== username) {
      // The name being left behind keeps resolving via redirect — on EVERY
      // change, first claim included. (Originally first claims skipped the
      // alias on the theory that the auto-derived name was never seen, but
      // an account can have public /t/{username}/... URLs in the wild before
      // ever spending its claim — e.g. an X-backfilled username shared on the
      // leaderboard — and those links must not die. A stale alias for a name
      // nobody ever saw is harmless.)
      db.insert(usernameAliases)
        .values({ username: oldUsername, userId, createdAt: Date.now() })
        .run()
    }

    db.update(users)
      .set({ username, usernameChosen: true, usernameChangeCount: newChangeCount })
      .where(eq(users.id, userId))
      .run()
  })

  return { ok: true, username, changesRemaining: MAX_USERNAME_CHANGES - newChangeCount }
}

// ===========================================
// X (Twitter) identity linking
// ===========================================

export interface FindOrCreateXResult {
  userId: string
  username: string
  created: boolean
  conflict?: 'linked_elsewhere' | 'sign_in_required' | 'stale_link'
}

/**
 * True for a SQLite primary-key/unique violation from better-sqlite3 (same
 * check as `src/app/api/bookmarks/[id]/tags/route.ts`) — used below to
 * detect a lost race instead of crashing on it.
 */
function isDuplicateRowError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || code === 'SQLITE_CONSTRAINT_UNIQUE'
}

function isRetryableSqliteRace(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED'
}

const MAX_RESOLVE_ATTEMPTS = 3

function finalizeXIdentityAndProfile(params: {
  userId: string
  x: {
    xUserId: string
    username: string
    name?: string | null
    profileImageUrl: string | null
  }
  expectedXLinkVersion?: number
  insertIdentity: boolean
  onlyFillMissingProfile: boolean
}): { username: string } | null {
  const { userId, x, expectedXLinkVersion, insertIdentity, onlyFillMissingProfile } = params

  return runInTransaction(() => {
    const user = db.select().from(users).where(eq(users.id, userId)).limit(1).get()
    if (!user) return null
    if (expectedXLinkVersion !== undefined && user.xLinkVersion !== expectedXLinkVersion) {
      return null
    }

    const identity = db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.providerId, x.xUserId)))
      .limit(1)
      .get()
    if (identity && identity.userId !== userId) return null
    if (!identity) {
      if (!insertIdentity) return null
      db.insert(userIdentities).values({ provider: 'x', providerId: x.xUserId, userId }).run()
    }

    const updates: Partial<typeof users.$inferInsert> = {}
    if (x.name && (onlyFillMissingProfile ? !user.displayName : x.name !== user.displayName)) {
      updates.displayName = x.name
    }
    if (
      x.profileImageUrl &&
      (onlyFillMissingProfile ? !user.avatarUrl : x.profileImageUrl !== user.avatarUrl)
    ) {
      updates.avatarUrl = x.profileImageUrl
    }
    if (Object.keys(updates).length > 0) {
      db.update(users).set(updates).where(eq(users.id, userId)).run()
    }

    return { username: user.username }
  })
}

/**
 * Resolve (or create) the app account for an X login.
 *
 * - Existing 'x' identity → if there is no session, `sign_in_required` (X
 *   is not a sign-in method). If a different session tries to link it,
 *   `linked_elsewhere`. Matching session returns the owner (refreshing
 *   display name/avatar).
 * - No existing identity, but a `users` row already has `id === xUserId` →
 *   that id was previously claimed by an X-first signup (the historical
 *   `userId == X id` convention) whose identity row was later detached, e.g.
 *   by `unlinkX` (which drops the `user_identities` row but keeps the
 *   `users` row so the account — now identified by email — survives). This
 *   is the SAME conflict as above, just discovered via `users.id` instead of
 *   `user_identities`: if a different session is signed in, report it
 *   without touching the session; otherwise relink X to that account. Was
 *   previously unhandled — a blind insert crashed with `SqliteError: UNIQUE
 *   constraint failed: users.id` (Sentry WHITE-SUN-6317-17).
 * - No existing identity + an active session (`sessionUserId`) → if that user
 *   already owns a different X identity, return `linked_elsewhere`; otherwise
 *   link this X account for bookmark sync. X is not a sign-in method — it
 *   never creates an account.
 * - No existing identity + no session → `sign_in_required`. The caller must
 *   bounce to email sign-in; do not create a user.
 *
 * Every insert is wrapped so a lost race (two callbacks resolving the same X
 * id at once) re-checks from the top instead of crashing on the resulting
 * constraint violation — the loser's retry sees what the winner committed.
 */
export async function findOrCreateUserForX(
  x: { xUserId: string; username: string; name?: string | null; profileImageUrl: string | null },
  sessionUserId?: string,
  expectedXLinkVersion?: number,
): Promise<FindOrCreateXResult> {
  for (let attempt = 0; attempt < MAX_RESOLVE_ATTEMPTS; attempt++) {
    if (sessionUserId && expectedXLinkVersion !== undefined) {
      const [accountGeneration] = await db
        .select({ xLinkVersion: users.xLinkVersion })
        .from(users)
        .where(eq(users.id, sessionUserId))
        .limit(1)
      if (!accountGeneration || accountGeneration.xLinkVersion !== expectedXLinkVersion) {
        return {
          userId: sessionUserId,
          username: '',
          created: false,
          conflict: 'stale_link',
        }
      }
    }

    const [existingIdentity] = await db
      .select()
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.providerId, x.xUserId)))
      .limit(1)

    if (existingIdentity) {
      if (!sessionUserId) {
        return { userId: '', username: '', created: false, conflict: 'sign_in_required' }
      }
      if (existingIdentity.userId !== sessionUserId) {
        return {
          userId: existingIdentity.userId,
          username: '',
          created: false,
          conflict: 'linked_elsewhere',
        }
      }

      let finalized: { username: string } | null
      try {
        finalized = finalizeXIdentityAndProfile({
          userId: existingIdentity.userId,
          x,
          expectedXLinkVersion,
          insertIdentity: false,
          onlyFillMissingProfile: false,
        })
      } catch (error) {
        if (!isRetryableSqliteRace(error)) throw error
        continue
      }
      if (!finalized) {
        return {
          userId: existingIdentity.userId,
          username: '',
          created: false,
          conflict: 'stale_link',
        }
      }

      return {
        userId: existingIdentity.userId,
        username: finalized.username,
        created: false,
      }
    }

    if (sessionUserId) {
      const [sessionXIdentity] = await db
        .select({ providerId: userIdentities.providerId })
        .from(userIdentities)
        .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.userId, sessionUserId)))
        .limit(1)

      if (sessionXIdentity && sessionXIdentity.providerId !== x.xUserId) {
        return {
          userId: sessionUserId,
          username: '',
          created: false,
          conflict: 'linked_elsewhere',
        }
      }
    }

    const [ownerOfXId] = await db.select().from(users).where(eq(users.id, x.xUserId)).limit(1)

    if (ownerOfXId) {
      if (!sessionUserId) {
        return { userId: '', username: '', created: false, conflict: 'sign_in_required' }
      }
      if (ownerOfXId.id !== sessionUserId) {
        return { userId: ownerOfXId.id, username: '', created: false, conflict: 'linked_elsewhere' }
      }

      try {
        const finalized = finalizeXIdentityAndProfile({
          userId: ownerOfXId.id,
          x,
          expectedXLinkVersion,
          insertIdentity: true,
          onlyFillMissingProfile: false,
        })
        if (!finalized) {
          return {
            userId: ownerOfXId.id,
            username: '',
            created: false,
            conflict: 'stale_link',
          }
        }
        return { userId: ownerOfXId.id, username: finalized.username, created: false }
      } catch (err) {
        if (!isDuplicateRowError(err) && !isRetryableSqliteRace(err)) throw err
        continue // lost the race — retry sees the winner's committed identity
      }
    }

    if (sessionUserId) {
      // Linking a fresh X account to the currently signed-in (e.g. email) user.
      try {
        const finalized = finalizeXIdentityAndProfile({
          userId: sessionUserId,
          x,
          expectedXLinkVersion,
          insertIdentity: true,
          onlyFillMissingProfile: true,
        })
        if (!finalized) {
          return {
            userId: sessionUserId,
            username: '',
            created: false,
            conflict: 'stale_link',
          }
        }
        return { userId: sessionUserId, username: finalized.username, created: false }
      } catch (err) {
        if (!isDuplicateRowError(err) && !isRetryableSqliteRace(err)) throw err
        continue
      }
    }

    // X is not a sign-in method — never create an account from an X login.
    return { userId: '', username: '', created: false, conflict: 'sign_in_required' }
  }

  throw new Error('findOrCreateUserForX: could not resolve X identity after repeated races')
}

// ===========================================
// Email identity
// ===========================================

export async function findOrCreateUserForEmail(
  rawEmail: string,
): Promise<{ userId: string; username: string; created: boolean }> {
  const email = rawEmail.trim().toLowerCase()
  const base = sanitizeLocalPart(email)
  let usernameAttempt = 0

  for (let attempt = 0; attempt < MAX_EMAIL_CLAIM_ATTEMPTS; attempt++) {
    const userId = `u_${randomHex(8)}`
    const suffix = usernameAttempt === 0 ? '' : String(usernameAttempt + 1)
    const username = `${base.slice(0, Math.max(1, 20 - suffix.length))}${suffix}`

    try {
      return runInTransaction(() => {
        const existingIdentity = db
          .select()
          .from(userIdentities)
          .where(and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerId, email)))
          .limit(1)
          .get()
        if (existingIdentity) {
          const user = db
            .select()
            .from(users)
            .where(eq(users.id, existingIdentity.userId))
            .limit(1)
            .get()
          return {
            userId: existingIdentity.userId,
            username: user?.username ?? '',
            created: false,
          }
        }

        db.insert(users).values({ id: userId, username, email }).run()
        db.insert(userIdentities).values({ provider: 'email', providerId: email, userId }).run()
        return { userId, username, created: true }
      })
    } catch (error) {
      if (!isDuplicateRowError(error) && !isRetryableSqliteRace(error)) throw error
      if (isDuplicateRowError(error)) usernameAttempt += 1
      // Another email claimant or username owner committed first. Retry from
      // the identity lookup so same-email losers resolve to the winner and
      // unrelated username collisions advance deterministically.
    }
  }

  throw new Error('findOrCreateUserForEmail: could not claim identity after repeated races')
}

export async function linkEmailToUser(
  userId: string,
  rawEmail: string,
): Promise<{ ok: true } | { error: 'email_in_use' }> {
  const email = rawEmail.trim().toLowerCase()

  for (let attempt = 0; attempt < MAX_EMAIL_CLAIM_ATTEMPTS; attempt++) {
    try {
      return runInTransaction(() => {
        const account = db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .get()
        if (!account) return { error: 'email_in_use' as const }

        const existingIdentity = db
          .select()
          .from(userIdentities)
          .where(and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerId, email)))
          .limit(1)
          .get()
        if (existingIdentity && existingIdentity.userId !== userId) {
          return { error: 'email_in_use' as const }
        }

        // Claim the target first. If another account wins its unique key, this
        // transaction rolls back before the current email identity is touched.
        if (!existingIdentity) {
          db.insert(userIdentities).values({ provider: 'email', providerId: email, userId }).run()
        }
        db.delete(userIdentities)
          .where(
            and(
              eq(userIdentities.provider, 'email'),
              eq(userIdentities.userId, userId),
              ne(userIdentities.providerId, email),
            ),
          )
          .run()
        db.update(users).set({ email }).where(eq(users.id, userId)).run()
        return { ok: true as const }
      })
    } catch (error) {
      if (isDuplicateRowError(error)) return { error: 'email_in_use' }
      if (!isRetryableSqliteRace(error)) throw error
    }
  }

  throw new Error('linkEmailToUser: could not claim identity after repeated database races')
}

export async function unlinkX(userId: string): Promise<{ ok: true } | { error: 'last_identity' }> {
  const identityRows = await db
    .select()
    .from(userIdentities)
    .where(eq(userIdentities.userId, userId))
  const hasEmail = identityRows.some((row) => row.provider === 'email')
  if (!hasEmail) {
    return { error: 'last_identity' }
  }

  runInTransaction(() => {
    db.update(users)
      .set({ xLinkVersion: sql`${users.xLinkVersion} + 1` })
      .where(eq(users.id, userId))
      .run()
    db.delete(userIdentities)
      .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.userId, userId)))
      .run()
    db.delete(oauthTokens).where(eq(oauthTokens.userId, userId)).run()
    db.delete(oauthState).where(eq(oauthState.userId, userId)).run()
  })

  return { ok: true }
}

// ===========================================
// Login tokens (magic link)
// ===========================================

export async function createLoginToken(params: {
  email: string
  intent: 'signin' | 'change'
  userId?: string
  returnTo?: string
}): Promise<string> {
  const email = params.email.trim().toLowerCase()
  const raw = crypto.randomBytes(32).toString('base64url')
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  const expiresAt = Date.now() + TOKEN_TTL_MS

  // Opportunistic cleanup of expired tokens — no separate sweeper needed.
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, Date.now()))

  await db.insert(loginTokens).values({
    tokenHash,
    email,
    intent: params.intent,
    userId: params.userId ?? null,
    returnTo: params.returnTo ?? null,
    expiresAt,
  })

  return raw
}

/**
 * Delete a token that was created but whose email failed to send, so the
 * failed attempt doesn't hold the per-email rate limit for 60s and lock the
 * user out with a confusing "wait a minute" after a transient send error.
 */
export async function invalidateLoginToken(rawToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  await db.delete(loginTokens).where(eq(loginTokens.tokenHash, tokenHash))
}

export async function consumeLoginToken(
  rawToken: string,
): Promise<typeof loginTokens.$inferSelect | null> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const now = Date.now()
  const [row] = db
    .update(loginTokens)
    .set({ usedAt: new Date(now).toISOString() })
    .where(
      and(
        eq(loginTokens.tokenHash, tokenHash),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, now),
      ),
    )
    .returning()
    .all()

  // Preserve the historical return payload: callers receive the token row as
  // it looked before consumption (usedAt null), while the stored row is marked.
  return row ? { ...row, usedAt: null } : null
}

/**
 * True if an unexpired, unused login token for this email was created within
 * the last `withinMs` (default 60s) — used to rate-limit the request/change
 * endpoints. `expiresAt` is always set to creation time + TOKEN_TTL_MS, so we
 * back out the creation time from it rather than parsing the SQLite
 * CURRENT_TIMESTAMP text column (which has no timezone marker).
 */
export async function hasRecentLoginToken(email: string, withinMs = 60_000): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  const rows = await db
    .select({ expiresAt: loginTokens.expiresAt })
    .from(loginTokens)
    .where(
      and(
        eq(loginTokens.email, normalized),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, Date.now()),
      ),
    )
    .orderBy(desc(loginTokens.expiresAt))
    .limit(1)

  if (rows.length === 0) return false
  const createdAtMs = rows[0].expiresAt - TOKEN_TTL_MS
  return Date.now() - createdAtMs < withinMs
}
