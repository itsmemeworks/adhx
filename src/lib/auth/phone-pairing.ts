import crypto from 'crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { appPairCodes, users } from '@/lib/db/schema'
import { createAccessKey } from './access-keys'

/**
 * Connecting the phone app. Settings → Phone app makes a short code (shown as
 * a QR code and as text); the app spends it once, within 10 minutes, for a
 * phone key (an access key with scope `phone`). Only the code's SHA-256 is
 * stored, and making a new code cancels the old one.
 */

/** No 0/O, 1/I/L: easy to read off a screen and type. */
export const PAIR_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const PAIR_CODE_LENGTH = 8
export const PAIR_CODE_TTL_MS = 10 * 60 * 1000

const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex')

/** `abcd-efgh` / `ABCD EFGH` → `ABCDEFGH`, or null when it can't be a code. */
export function normalizePairCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  if (code.length !== PAIR_CODE_LENGTH) return null
  for (const ch of code) if (!PAIR_CODE_ALPHABET.includes(ch)) return null
  return code
}

/** A fresh code for this account; any earlier one stops working. */
export function createPairCode(
  userId: string,
  now = Date.now(),
): { code: string; expiresAt: string } {
  let code = ''
  for (let i = 0; i < PAIR_CODE_LENGTH; i++) {
    code += PAIR_CODE_ALPHABET[crypto.randomInt(PAIR_CODE_ALPHABET.length)]
  }
  const expiresAt = now + PAIR_CODE_TTL_MS
  runInTransaction(() => {
    db.delete(appPairCodes).where(eq(appPairCodes.userId, userId)).run()
    db.insert(appPairCodes)
      .values({
        codeHash: hash(code),
        userId,
        expiresAt,
        usedAt: null,
        createdAt: new Date(now).toISOString(),
      })
      .run()
  })
  return { code, expiresAt: new Date(expiresAt).toISOString() }
}

export type RedeemResult =
  | { ok: true; key: string; name: string; userId: string; username: string }
  | { ok: false; reason: 'bad_code' | 'too_many' }

/**
 * Spend a code for a phone key. One conditional write marks it used, so two
 * phones scanning the same code can't both connect.
 */
export function redeemPairCode(input: unknown, name: unknown, now = Date.now()): RedeemResult {
  const code = normalizePairCode(input)
  if (!code) return { ok: false, reason: 'bad_code' }
  return runInTransaction((): RedeemResult => {
    const [row] = db
      .select({ userId: appPairCodes.userId })
      .from(appPairCodes)
      .where(
        and(
          eq(appPairCodes.codeHash, hash(code)),
          isNull(appPairCodes.usedAt),
          gt(appPairCodes.expiresAt, now),
        ),
      )
      .limit(1)
      .all()
    if (!row) return { ok: false, reason: 'bad_code' }
    const [user] = db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1)
      .all()
    if (!user) return { ok: false, reason: 'bad_code' }
    const created = createAccessKey(row.userId, name, 'phone')
    if (!created) return { ok: false, reason: 'too_many' }
    db.update(appPairCodes)
      .set({ usedAt: new Date(now).toISOString() })
      .where(eq(appPairCodes.codeHash, hash(code)))
      .run()
    return {
      ok: true,
      key: created.key,
      name: created.name,
      userId: row.userId,
      username: user.username,
    }
  })
}
