import crypto from 'crypto'
import { db, runInTransaction } from '@/lib/db'
import { users, userIdentities, loginTokens, oauthTokens } from '@/lib/db/schema'
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm'
import { deleteTokens } from './oauth'

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
 * True if `username` is already taken by a *different* account.
 * `excludeUserId` lets a user check/re-claim their own current username
 * without it reading as taken.
 */
export async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  if (rows.length === 0) return false
  return rows[0].id !== excludeUserId
}

function sanitizeLocalPart(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  const cleaned = localPart
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 15)
  return cleaned || 'reader'
}

/**
 * Public username grammar: lowercase `[a-z0-9_-]`, must start alphanumeric,
 * capped at 15 chars. Used by the `/welcome` one-shot chooser and its live
 * availability check — the single normalizer so client preview and server
 * validation never disagree.
 */
export function sanitizeUsername(raw: string): string {
  const stripped = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const startsAlnum = stripped.replace(/^[-_]+/, '')
  return startsAlnum.slice(0, 15)
}

export type ChooseUsernameResult =
  { ok: true; username: string } | { error: 'taken' | 'invalid' | 'already_chosen' }

/**
 * One-shot username claim for the `/welcome` prompt. Rejects when the user
 * has already spent their choice (`usernameChosen`), validates grammar, then
 * atomically updates `username` + `usernameChosen` so a claim can never be
 * spent twice.
 */
export async function chooseUsername(userId: string, raw: string): Promise<ChooseUsernameResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return { error: 'invalid' }
  if (user.usernameChosen) return { error: 'already_chosen' }

  const username = sanitizeUsername(raw)
  if (username.length < 3 || username.length > 15) {
    return { error: 'invalid' }
  }

  if (await isUsernameTaken(username, userId)) {
    return { error: 'taken' }
  }

  runInTransaction(() => {
    db.update(users).set({ username, usernameChosen: true }).where(eq(users.id, userId)).run()
  })

  return { ok: true, username }
}

// ===========================================
// X (Twitter) identity linking
// ===========================================

export interface FindOrCreateXResult {
  userId: string
  username: string
  created: boolean
  conflict?: 'linked_elsewhere'
}

/**
 * Resolve (or create) the app account for an X login.
 *
 * - Existing 'x' identity → return its owner (refreshing display name/avatar).
 *   If a different session is currently signed in and tries to link an X
 *   account already tied to someone else, that's a conflict — the caller
 *   should NOT change the session.
 * - No existing identity + an active session (`sessionUserId`) → link this X
 *   account to that session's user (e.g. an email user connecting X).
 * - No existing identity + no session → brand new user, id = the X user id
 *   (matches the historical `userId == X id` convention).
 */
export async function findOrCreateUserForX(
  x: { xUserId: string; username: string; name?: string | null; profileImageUrl: string | null },
  sessionUserId?: string,
): Promise<FindOrCreateXResult> {
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

  if (sessionUserId) {
    // Linking a fresh X account to the currently signed-in (e.g. email) user.
    runInTransaction(() => {
      db.insert(userIdentities)
        .values({ provider: 'x', providerId: x.xUserId, userId: sessionUserId })
        .run()
    })

    const [user] = await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1)
    const updates: Partial<typeof users.$inferInsert> = {}
    if (x.name && !user?.displayName) updates.displayName = x.name
    if (x.profileImageUrl && !user?.avatarUrl) updates.avatarUrl = x.profileImageUrl
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, sessionUserId))
    }

    return { userId: sessionUserId, username: user?.username ?? x.username, created: false }
  }

  // Brand new user, keyed by the X id.
  let username = x.username
  if (await isUsernameTaken(username)) {
    username = `${x.username}-x${randomHex(2)}`
  }

  runInTransaction(() => {
    db.insert(users)
      .values({
        id: x.xUserId,
        username,
        displayName: x.name ?? null,
        avatarUrl: x.profileImageUrl,
        usernameChosen: true, // picked their handle on X — no /welcome prompt
      })
      .run()
    db.insert(userIdentities)
      .values({ provider: 'x', providerId: x.xUserId, userId: x.xUserId })
      .run()
  })

  return { userId: x.xUserId, username, created: true }
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
