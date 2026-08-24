import crypto from 'crypto'
import { db, runInTransaction } from '@/lib/db'
import { users, userIdentities, loginTokens, oauthTokens, usernameAliases } from '@/lib/db/schema'
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm'
import { deleteTokens } from './oauth'
import { MAX_USERNAME_CHANGES, sanitizeUsername } from './username-rules'

export { MAX_USERNAME_CHANGES, sanitizeUsername }

const TOKEN_TTL_MS = 15 * 60 * 1000

// ===========================================
// Account read model
// ===========================================

export interface AccountIdentities {
  x: { providerId: string; username?: string } | null
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
 * Returns null if there's no `users` row yet (e.g. a pre-migration session —
 * callers should lazily create one, see `/api/auth/me`).
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
    .select({ username: oauthTokens.username })
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
        ? { providerId: xIdentity.providerId, username: tokenRow?.username ?? undefined }
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
  conflict?: 'linked_elsewhere' | 'sign_in_required'
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

const MAX_RESOLVE_ATTEMPTS = 3

/**
 * Resolve (or create) the app account for an X login.
 *
 * - Existing 'x' identity → return its owner (refreshing display name/avatar).
 *   If a different session is currently signed in and tries to link an X
 *   account already tied to someone else, that's a conflict — the caller
 *   should NOT change the session.
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
 * - No existing identity + an active session (`sessionUserId`) → link this X
 *   account to that session's user (an email user connecting X for bookmark
 *   sync). X is not a sign-in method — it never creates an account.
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
): Promise<FindOrCreateXResult> {
  for (let attempt = 0; attempt < MAX_RESOLVE_ATTEMPTS; attempt++) {
    const [existingIdentity] = await db
      .select()
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.providerId, x.xUserId)))
      .limit(1)

    if (existingIdentity) {
      if (sessionUserId && existingIdentity.userId !== sessionUserId) {
        return {
          userId: existingIdentity.userId,
          username: '',
          created: false,
          conflict: 'linked_elsewhere',
        }
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, existingIdentity.userId))
        .limit(1)
      const updates: Partial<typeof users.$inferInsert> = {}
      if (x.name && x.name !== user?.displayName) updates.displayName = x.name
      if (x.profileImageUrl && x.profileImageUrl !== user?.avatarUrl)
        updates.avatarUrl = x.profileImageUrl
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, existingIdentity.userId))
      }

      return {
        userId: existingIdentity.userId,
        username: user?.username ?? x.username,
        created: false,
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
        runInTransaction(() => {
          db.insert(userIdentities)
            .values({ provider: 'x', providerId: x.xUserId, userId: ownerOfXId.id })
            .run()
        })
      } catch (err) {
        if (!isDuplicateRowError(err)) throw err
        continue // lost the race — retry sees the winner's committed identity
      }

      const updates: Partial<typeof users.$inferInsert> = {}
      if (x.name && x.name !== ownerOfXId.displayName) updates.displayName = x.name
      if (x.profileImageUrl && x.profileImageUrl !== ownerOfXId.avatarUrl)
        updates.avatarUrl = x.profileImageUrl
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, ownerOfXId.id))
      }

      return { userId: ownerOfXId.id, username: ownerOfXId.username, created: false }
    }

    if (sessionUserId) {
      // Linking a fresh X account to the currently signed-in (e.g. email) user.
      try {
        runInTransaction(() => {
          db.insert(userIdentities)
            .values({ provider: 'x', providerId: x.xUserId, userId: sessionUserId })
            .run()
        })
      } catch (err) {
        if (!isDuplicateRowError(err)) throw err
        continue
      }

      const [user] = await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1)
      const updates: Partial<typeof users.$inferInsert> = {}
      if (x.name && !user?.displayName) updates.displayName = x.name
      if (x.profileImageUrl && !user?.avatarUrl) updates.avatarUrl = x.profileImageUrl
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, sessionUserId))
      }

      return { userId: sessionUserId, username: user?.username ?? x.username, created: false }
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

  const [existingIdentity] = await db
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerId, email)))
    .limit(1)

  if (existingIdentity) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, existingIdentity.userId))
      .limit(1)
    return { userId: existingIdentity.userId, username: user?.username ?? '', created: false }
  }

  const userId = `u_${randomHex(8)}`
  const base = sanitizeLocalPart(email)

  let username = base
  let suffix = 1
  while (await isUsernameTaken(username)) {
    suffix += 1
    username = `${base}${suffix}`.slice(0, 20)
  }

  runInTransaction(() => {
    db.insert(users).values({ id: userId, username, email }).run()
    db.insert(userIdentities).values({ provider: 'email', providerId: email, userId }).run()
  })

  return { userId, username, created: true }
}

export async function linkEmailToUser(
  userId: string,
  rawEmail: string,
): Promise<{ ok: true } | { error: 'email_in_use' }> {
  const email = rawEmail.trim().toLowerCase()

  const [existingIdentity] = await db
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerId, email)))
    .limit(1)

  if (existingIdentity && existingIdentity.userId !== userId) {
    return { error: 'email_in_use' }
  }

  runInTransaction(() => {
    db.delete(userIdentities)
      .where(and(eq(userIdentities.provider, 'email'), eq(userIdentities.userId, userId)))
      .run()
    db.insert(userIdentities).values({ provider: 'email', providerId: email, userId }).run()
    db.update(users).set({ email }).where(eq(users.id, userId)).run()
  })

  return { ok: true }
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

  await db
    .delete(userIdentities)
    .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.userId, userId)))
  await deleteTokens(userId)

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
  const [row] = await db
    .select()
    .from(loginTokens)
    .where(eq(loginTokens.tokenHash, tokenHash))
    .limit(1)

  if (!row) return null
  if (row.usedAt) return null
  if (row.expiresAt < Date.now()) return null

  await db
    .update(loginTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(loginTokens.tokenHash, tokenHash))

  return row
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
