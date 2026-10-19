import crypto from 'crypto'
import { and, asc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { invites, userIdentities, usernameAliases, users } from '@/lib/db/schema'
import { sanitizeUsername } from './username-rules'

/**
 * Invite links: the easy way in. An admin (or, with `INVITES=members`, any
 * member) makes a link for one person. Opening it shows a script-free page
 * that says who invited you; picking a name and pressing Join makes an
 * account with no email (its sign-in identity is the invite itself) and signs
 * that browser in. The invite is the permission, so `ALLOWED_EMAILS` doesn't
 * apply.
 *
 * Only the token's SHA-256 is stored. An invite works once, for 7 days, and
 * stops working when it's revoked or its maker is banned, deleted, or no
 * longer allowed to invite.
 */

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Invites one person can have waiting at once. */
export const MAX_PENDING_INVITES = 20
const NAME_HINT_MAX = 40
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

/** `INVITES=members` lets every member make invites; otherwise only admins. */
export function invitesOpenToMembers(): boolean {
  return process.env['INVITES']?.trim().toLowerCase() === 'members'
}

/** May this (signed-in, not banned) account make invites right now? */
export function mayCreateInvites(userId: string): boolean {
  const user = db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get()
  if (!user) return false
  return user.role === 'admin' || invitesOpenToMembers()
}

/**
 * The invite's maker still exists, isn't banned, and may still invite. Kept
 * as SQL so the consuming write checks it in the same statement.
 */
function makerCanInvite(): SQL {
  const allowed = invitesOpenToMembers() ? sql`1` : sql`u.role = 'admin'`
  // Spelled out as `invites.created_by`: user_bans has its own created_by.
  return sql`(EXISTS (SELECT 1 FROM users u WHERE u.id = invites.created_by AND (${allowed}))
    AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = invites.created_by))`
}

function cleanNameHint(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_HINT_MAX)
  return clean || null
}

export type CreateInviteResult =
  | { ok: true; id: string; token: string; expiresAt: string }
  | { ok: false; reason: 'forbidden' | 'too_many' }

export function createInvite(
  userId: string,
  options: { nameHint?: unknown } = {},
  now = Date.now(),
): CreateInviteResult {
  if (!mayCreateInvites(userId)) return { ok: false, reason: 'forbidden' }
  const token = crypto.randomBytes(32).toString('base64url')
  const id = `inv_${crypto.randomBytes(9).toString('base64url')}`
  const expiresAt = now + INVITE_TTL_MS
  return runInTransaction((): CreateInviteResult => {
    const [{ pending }] = db
      .select({ pending: sql<number>`count(*)` })
      .from(invites)
      .where(
        and(
          eq(invites.createdBy, userId),
          isNull(invites.usedAt),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, now),
        ),
      )
      .all()
    if (Number(pending) >= MAX_PENDING_INVITES) return { ok: false, reason: 'too_many' }
    db.insert(invites)
      .values({
        id,
        tokenHash: hash(token),
        createdBy: userId,
        createdAt: new Date(now).toISOString(),
        expiresAt,
        nameHint: cleanNameHint(options.nameHint),
      })
      .run()
    return { ok: true, id, token, expiresAt: new Date(expiresAt).toISOString() }
  })
}

export interface InviteSummary {
  id: string
  createdAt: string
  expiresAt: string
  nameHint: string | null
  /** The maker's username. */
  createdBy: string
  mine: boolean
}

/**
 * Invites that still work: unused, unrevoked, unexpired, from a maker who may
 * still invite. Never the token (only its hash is kept). Everyone's for an
 * admin, otherwise the caller's own.
 */
export function listPendingInvites(
  userId: string,
  options: { all: boolean },
  now = Date.now(),
): InviteSummary[] {
  const rows = db
    .select({
      id: invites.id,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
      nameHint: invites.nameHint,
      createdById: invites.createdBy,
      createdBy: users.username,
    })
    .from(invites)
    .innerJoin(users, eq(users.id, invites.createdBy))
    .where(
      and(
        options.all ? undefined : eq(invites.createdBy, userId),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, now),
        makerCanInvite(),
      ),
    )
    .orderBy(asc(invites.expiresAt))
    .all()
  return rows.map(({ createdById, expiresAt, ...row }) => ({
    ...row,
    expiresAt: new Date(expiresAt).toISOString(),
    mine: createdById === userId,
  }))
}

/** Revoke an unused invite: the maker's own, or any for an admin. */
export function revokeInvite(id: string, userId: string, isAdmin: boolean): boolean {
  const result = db
    .update(invites)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(invites.id, id),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        isAdmin ? undefined : eq(invites.createdBy, userId),
      ),
    )
    .run()
  return result.changes === 1
}

export type InviteProblem = 'bad' | 'used' | 'expired' | 'revoked' | 'dead'

export type InviteLookup =
  { ok: true; inviter: string; nameHint: string | null } | { ok: false; problem: InviteProblem }

/** Why this token can't be used, or who it's from. Never changes anything. */
export function readInvite(token: unknown, now = Date.now()): InviteLookup {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return { ok: false, problem: 'bad' }
  const row = db
    .select({
      usedAt: invites.usedAt,
      revokedAt: invites.revokedAt,
      expiresAt: invites.expiresAt,
      nameHint: invites.nameHint,
      live: sql<number>`CASE WHEN ${makerCanInvite()} THEN 1 ELSE 0 END`,
      username: users.username,
      displayName: users.displayName,
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(eq(invites.tokenHash, hash(token)))
    .get()
  if (!row) return { ok: false, problem: 'bad' }
  if (row.usedAt) return { ok: false, problem: 'used' }
  if (row.revokedAt) return { ok: false, problem: 'revoked' }
  if (row.expiresAt <= now) return { ok: false, problem: 'expired' }
  if (!row.live || !row.username) return { ok: false, problem: 'dead' }
  return {
    ok: true,
    inviter: row.displayName?.trim() || row.username,
    nameHint: row.nameHint,
  }
}

export type RedeemInviteResult =
  | { ok: true; userId: string; username: string }
  | { ok: false; problem: InviteProblem }
  | { ok: false; nameError: 'invalid' | 'taken'; username: string }

class NameTaken extends Error {}

function usernameTaken(username: string): boolean {
  const user = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
  if (user) return true
  const alias = db
    .select({ userId: usernameAliases.userId })
    .from(usernameAliases)
    .where(eq(usernameAliases.username, username))
    .get()
  return !!alias
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
}

/**
 * Spend an invite on a new account named `rawName`. One conditional write
 * claims the invite, so concurrent joins have exactly one winner. The name is
 * checked like `/welcome` (`sanitizeUsername`, 3–15 characters, not anyone's
 * current or past name); a bad or taken name rolls the claim back, leaving
 * the invite unused.
 */
export function redeemInvite(
  token: unknown,
  rawName: unknown,
  now = Date.now(),
): RedeemInviteResult {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return { ok: false, problem: 'bad' }
  const username = sanitizeUsername(typeof rawName === 'string' ? rawName.trim() : '')
  if (username.length < 3) return { ok: false, nameError: 'invalid', username }

  const tokenHash = hash(token)
  const userId = `u_${crypto.randomBytes(8).toString('hex')}`
  try {
    const claimed = runInTransaction(() => {
      const invite = db
        .update(invites)
        .set({ usedAt: new Date(now).toISOString() })
        .where(
          and(
            eq(invites.tokenHash, tokenHash),
            isNull(invites.usedAt),
            isNull(invites.revokedAt),
            gt(invites.expiresAt, now),
            makerCanInvite(),
          ),
        )
        .returning({ id: invites.id })
        .get()
      if (!invite) return false
      if (usernameTaken(username)) throw new NameTaken()
      db.insert(users).values({ id: userId, username, usernameChosen: true }).run()
      db.insert(userIdentities).values({ provider: 'invite', providerId: invite.id, userId }).run()
      db.update(invites).set({ usedBy: userId }).where(eq(invites.id, invite.id)).run()
      return true
    })
    if (claimed) return { ok: true, userId, username }
  } catch (error) {
    if (error instanceof NameTaken || isUniqueViolation(error)) {
      // Rolled back: the invite is still unused unless someone else just won it.
      const lookup = readInvite(token, now)
      if (!lookup.ok) return lookup
      return { ok: false, nameError: 'taken', username }
    }
    throw error
  }
  const lookup = readInvite(token, now)
  return lookup.ok ? { ok: false, problem: 'used' } : lookup
}
