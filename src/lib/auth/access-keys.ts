import crypto from 'crypto'
import { and, asc, count, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { accessKeys } from '@/lib/db/schema'
import { nanoid } from '@/lib/utils'

/**
 * Personal access keys: let something outside the browser act for one person.
 * Each key has a scope, and only the routes that ask for that scope accept it;
 * every other route still needs a session.
 *
 * - `search`: the adhx skill searches your saves (read-only).
 * - `phone`: the phone app saves links and reads how their copies are coming
 *   along (see src/lib/auth/phone-pairing.ts).
 *
 * Keys look like `adhx_` + 43 URL-safe characters. Only their SHA-256 is kept,
 * so a key is shown once, when it's made.
 */

export type AccessKeyScope = 'search' | 'phone'

export const ACCESS_KEY_PREFIX = 'adhx_'
export const MAX_ACCESS_KEYS = 5
export const MAX_PHONE_KEYS = 10
const MAX_KEYS: Record<AccessKeyScope, number> = { search: MAX_ACCESS_KEYS, phone: MAX_PHONE_KEYS }
const DEFAULT_NAME: Record<AccessKeyScope, string> = { search: 'Claude', phone: 'Phone' }
const NAME_MAX = 40
/** Don't rewrite `last_used_at` on every search. */
const TOUCH_EVERY_MS = 5 * 60 * 1000
const KEY_SHAPE = /^adhx_[A-Za-z0-9_-]{43}$/

export interface AccessKeySummary {
  id: string
  name: string
  hint: string
  createdAt: string
  lastUsedAt: string | null
}

const hash = (key: string) => crypto.createHash('sha256').update(key).digest('hex')

export function cleanKeyName(name: unknown, scope: AccessKeyScope = 'search'): string {
  const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
  return clean || DEFAULT_NAME[scope]
}

export function listAccessKeys(
  userId: string,
  scope: AccessKeyScope = 'search',
): AccessKeySummary[] {
  return db
    .select({
      id: accessKeys.id,
      name: accessKeys.name,
      hint: accessKeys.hint,
      createdAt: accessKeys.createdAt,
      lastUsedAt: accessKeys.lastUsedAt,
    })
    .from(accessKeys)
    .where(and(eq(accessKeys.userId, userId), eq(accessKeys.scope, scope)))
    .orderBy(asc(accessKeys.createdAt))
    .all()
}

/** Make a key. Returns it in full exactly once, or null at the limit. */
export function createAccessKey(
  userId: string,
  name: unknown,
  scope: AccessKeyScope = 'search',
): (AccessKeySummary & { key: string }) | null {
  const [{ n }] = db
    .select({ n: count() })
    .from(accessKeys)
    .where(and(eq(accessKeys.userId, userId), eq(accessKeys.scope, scope)))
    .all()
  if (n >= MAX_KEYS[scope]) return null
  const key = ACCESS_KEY_PREFIX + crypto.randomBytes(32).toString('base64url')
  const row = {
    id: nanoid(),
    userId,
    name: cleanKeyName(name, scope),
    keyHash: hash(key),
    hint: key.slice(-4),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    scope,
  }
  db.insert(accessKeys).values(row).run()
  return {
    id: row.id,
    name: row.name,
    hint: row.hint,
    createdAt: row.createdAt,
    lastUsedAt: null,
    key,
  }
}

export function deleteAccessKey(
  userId: string,
  id: string,
  scope: AccessKeyScope = 'search',
): boolean {
  return (
    db
      .delete(accessKeys)
      .where(and(eq(accessKeys.userId, userId), eq(accessKeys.id, id), eq(accessKeys.scope, scope)))
      .run().changes === 1
  )
}

/** The key row behind a `Bearer adhx_…` header with this scope, or null. */
export function accessKeyFromHeader(
  authorization: string | null | undefined,
  scope: AccessKeyScope = 'search',
): { id: string; userId: string; name: string } | null {
  const key = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!key || !KEY_SHAPE.test(key)) return null
  const [row] = db
    .select({
      id: accessKeys.id,
      userId: accessKeys.userId,
      name: accessKeys.name,
      lastUsedAt: accessKeys.lastUsedAt,
    })
    .from(accessKeys)
    .where(and(eq(accessKeys.keyHash, hash(key)), eq(accessKeys.scope, scope)))
    .limit(1)
    .all()
  if (!row) return null
  const now = Date.now()
  if (!row.lastUsedAt || now - Date.parse(row.lastUsedAt) > TOUCH_EVERY_MS) {
    db.update(accessKeys)
      .set({ lastUsedAt: new Date(now).toISOString() })
      .where(eq(accessKeys.id, row.id))
      .run()
  }
  return { id: row.id, userId: row.userId, name: row.name }
}

/** The account a `Bearer adhx_…` header with this scope belongs to, or null. */
export function userIdFromAccessKey(
  authorization: string | null | undefined,
  scope: AccessKeyScope = 'search',
): string | null {
  return accessKeyFromHeader(authorization, scope)?.userId ?? null
}

/** Like `userIdFromAccessKey`, and fails closed for a banned or waiting account, as sessions do. */
export async function accessKeyUser(
  authorization: string | null | undefined,
  scope: AccessKeyScope = 'search',
): Promise<string | null> {
  const userId = userIdFromAccessKey(authorization, scope)
  if (!userId) return null
  const { readUserBan } = await import('@/lib/admin/moderation')
  const ban = readUserBan(userId)
  if (!ban.ok || ban.value) return null
  // Waiting to be let in counts as signed out, as it does for sessions.
  const { accountApproval } = await import('./account-state')
  return (await accountApproval(userId)) === 'approved' ? userId : null
}
