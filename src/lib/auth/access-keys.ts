import crypto from 'crypto'
import { and, asc, count, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { accessKeys } from '@/lib/db/schema'
import { nanoid } from '@/lib/utils'

/**
 * Personal access keys: let a tool outside the browser (the adhx skill) search
 * one person's saves. Read-only by construction — only the routes that call
 * `userIdFromAccessKey` accept them; every other route still needs a session.
 *
 * Keys look like `adhx_` + 43 URL-safe characters. Only their SHA-256 is kept,
 * so a key is shown once, when it's made.
 */

export const ACCESS_KEY_PREFIX = 'adhx_'
export const MAX_ACCESS_KEYS = 5
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

export function cleanKeyName(name: unknown): string {
  const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : ''
  return clean || 'Claude'
}

export function listAccessKeys(userId: string): AccessKeySummary[] {
  return db
    .select({
      id: accessKeys.id,
      name: accessKeys.name,
      hint: accessKeys.hint,
      createdAt: accessKeys.createdAt,
      lastUsedAt: accessKeys.lastUsedAt,
    })
    .from(accessKeys)
    .where(eq(accessKeys.userId, userId))
    .orderBy(asc(accessKeys.createdAt))
    .all()
}

/** Make a key. Returns it in full exactly once, or null at the limit. */
export function createAccessKey(
  userId: string,
  name: unknown,
): (AccessKeySummary & { key: string }) | null {
  const [{ n }] = db
    .select({ n: count() })
    .from(accessKeys)
    .where(eq(accessKeys.userId, userId))
    .all()
  if (n >= MAX_ACCESS_KEYS) return null
  const key = ACCESS_KEY_PREFIX + crypto.randomBytes(32).toString('base64url')
  const row = {
    id: nanoid(),
    userId,
    name: cleanKeyName(name),
    keyHash: hash(key),
    hint: key.slice(-4),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
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

export function deleteAccessKey(userId: string, id: string): boolean {
  return (
    db
      .delete(accessKeys)
      .where(and(eq(accessKeys.userId, userId), eq(accessKeys.id, id)))
      .run().changes === 1
  )
}

/** The account a `Bearer adhx_…` header belongs to, or null. */
export function userIdFromAccessKey(authorization: string | null | undefined): string | null {
  const key = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!key || !KEY_SHAPE.test(key)) return null
  const [row] = db
    .select({ id: accessKeys.id, userId: accessKeys.userId, lastUsedAt: accessKeys.lastUsedAt })
    .from(accessKeys)
    .where(eq(accessKeys.keyHash, hash(key)))
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
  return row.userId
}

/** Like `userIdFromAccessKey`, and fails closed for a banned account, as sessions do. */
export async function accessKeyUser(
  authorization: string | null | undefined,
): Promise<string | null> {
  const userId = userIdFromAccessKey(authorization)
  if (!userId) return null
  const { readUserBan } = await import('@/lib/admin/moderation')
  const ban = readUserBan(userId)
  return ban.ok && !ban.value ? userId : null
}
