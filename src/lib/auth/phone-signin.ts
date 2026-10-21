import crypto from 'crypto'
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { loginTokens, userIdentities, users } from '@/lib/db/schema'
import { readUserBan } from '@/lib/admin/moderation'
import { createAccessKey } from './access-keys'

/**
 * Signing in on the phone without the web (`POST /api/app/signin`,
 * `/api/app/signin/verify`): an emailed 6-digit code, spent for a phone key
 * exactly like a pairing code.
 *
 * - Existing accounts only. An address with no account (or a banned one, or
 *   one still waiting to be let in) gets a stand-in code nobody receives, so
 *   asking and guessing look the same either way: no account enumeration.
 * - The code lives in `login_tokens` (intent `phone`) as an HMAC of the
 *   address and code, never as typed. 15 minutes, single use; five wrong
 *   tries burn it. A new code replaces the address's previous one.
 */

export const PHONE_CODE_TTL_MS = 15 * 60_000
export const PHONE_CODE_MAX_ATTEMPTS = 5
const CODE = /^\d{6}$/

function secret(): string {
  return process.env.SESSION_SECRET || process.env.TWITTER_CLIENT_SECRET || 'adhx-phone-sign-in'
}

/** What's stored for this address's code (the code can't be read back from it). */
function codeHash(email: string, code: string): string {
  return crypto.createHmac('sha256', secret()).update(`phone:${email}:${code}`).digest('hex')
}

/** `123 456` / `123-456` → `123456`, or null when it can't be a code. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.replace(/[\s-]/g, '')
  return CODE.test(code) ? code : null
}

/** The account that may sign in with this address: exists, approved, not banned (fail closed). */
export function signInAccountFor(email: string): { userId: string; username: string } | null {
  const [row] = db
    .select({ userId: users.id, username: users.username, approval: users.approval })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerId, email)))
    .limit(1)
    .all()
  if (!row) return null
  if (row.approval === 'pending' || row.approval === 'declined') return null
  const ban = readUserBan(row.userId)
  if (!ban.ok || ban.value) return null
  return { userId: row.userId, username: row.username }
}

/**
 * A fresh code for this address, replacing any earlier phone code. Returns
 * the code and whether it's for a real account (only then is it sent).
 */
export function createPhoneCode(
  email: string,
  now = Date.now(),
): { code: string; userId: string | null; tokenHash: string } {
  const account = signInAccountFor(email)
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const tokenHash = codeHash(email, code)
  runInTransaction(() => {
    db.delete(loginTokens).where(lt(loginTokens.expiresAt, now)).run()
    db.delete(loginTokens)
      .where(and(eq(loginTokens.email, email), eq(loginTokens.intent, 'phone')))
      .run()
    db.insert(loginTokens)
      .values({
        tokenHash,
        email,
        intent: 'phone',
        userId: account?.userId ?? null,
        expiresAt: now + PHONE_CODE_TTL_MS,
        createdAt: new Date(now).toISOString(),
      })
      .run()
  })
  return { code, userId: account?.userId ?? null, tokenHash }
}

/** Forget a code whose email didn't go, so the minute's wait doesn't apply. */
export function dropPhoneCode(tokenHash: string): void {
  db.delete(loginTokens).where(eq(loginTokens.tokenHash, tokenHash)).run()
}

export type VerifyResult =
  | { ok: true; key: string; name: string; username: string }
  | { ok: false; reason: 'bad_code' | 'expired' | 'too_many' }

/**
 * Spend a code for a phone key. A wrong code counts against the live one
 * (the fifth burns it); no live code, or a burned one, is `expired`. One
 * conditional write spends a right code, so it can't be spent twice. A code
 * for no account, or for an account that has since been banned or removed,
 * is `bad_code` like a wrong guess.
 */
export function verifyPhoneCode(
  email: string,
  input: unknown,
  name: unknown,
  now = Date.now(),
): VerifyResult {
  const code = normalizeCode(input)
  return runInTransaction((): VerifyResult => {
    const [live] = db
      .select({
        tokenHash: loginTokens.tokenHash,
        userId: loginTokens.userId,
        attempts: loginTokens.attempts,
      })
      .from(loginTokens)
      .where(
        and(
          eq(loginTokens.email, email),
          eq(loginTokens.intent, 'phone'),
          isNull(loginTokens.usedAt),
          gt(loginTokens.expiresAt, now),
        ),
      )
      .limit(1)
      .all()
    if (!live || live.attempts >= PHONE_CODE_MAX_ATTEMPTS) return { ok: false, reason: 'expired' }
    const right =
      code !== null &&
      crypto.timingSafeEqual(Buffer.from(codeHash(email, code)), Buffer.from(live.tokenHash))
    if (!right) {
      const attempts = live.attempts + 1
      db.update(loginTokens)
        .set({
          attempts: sql`${loginTokens.attempts} + 1`,
          ...(attempts >= PHONE_CODE_MAX_ATTEMPTS ? { usedAt: new Date(now).toISOString() } : {}),
        })
        .where(eq(loginTokens.tokenHash, live.tokenHash))
        .run()
      return { ok: false, reason: 'bad_code' }
    }
    const spent = db
      .update(loginTokens)
      .set({ usedAt: new Date(now).toISOString() })
      .where(and(eq(loginTokens.tokenHash, live.tokenHash), isNull(loginTokens.usedAt)))
      .run()
    if (spent.changes !== 1) return { ok: false, reason: 'expired' }
    // Still the same account, still allowed in (banned = no account).
    const account = live.userId ? signInAccountFor(email) : null
    if (!account || account.userId !== live.userId) return { ok: false, reason: 'bad_code' }
    const created = createAccessKey(account.userId, name, 'phone')
    if (!created) return { ok: false, reason: 'too_many' }
    return { ok: true, key: created.key, name: created.name, username: account.username }
  })
}
