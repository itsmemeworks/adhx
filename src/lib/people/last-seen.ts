import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { accessKeys, users } from '@/lib/db/schema'
import { recordAnalytic } from '@/lib/analytics/record'

/**
 * `users.last_seen_at`: when someone last used ADHX, for admins' People page.
 * Written from session requests (`GET /api/auth/me`, which every page asks)
 * and phone-key requests, at most once every 5 minutes per person: the
 * update only matches when the stored time is older than that, so a busy
 * page never writes on every request.
 */
export const LAST_SEEN_EVERY_MS = 5 * 60 * 1000

/** Note that this person is using ADHX now. Returns whether a row was written. Never throws. */
export function touchLastSeen(userId: string, now = Date.now()): boolean {
  if (!userId) return false
  try {
    const stamp = new Date(now).toISOString()
    const cutoff = new Date(now - LAST_SEEN_EVERY_MS).toISOString()
    return (
      db
        .update(users)
        .set({ lastSeenAt: stamp })
        .where(
          and(eq(users.id, userId), or(isNull(users.lastSeenAt), lt(users.lastSeenAt, cutoff))),
        )
        .run().changes === 1
    )
  } catch {
    return false
  }
}

export type PhonePlatform = 'ios' | 'android'

/**
 * Which kind of phone a request comes from, when it says: the iPhone app
 * talks through iOS's networking (`CFNetwork`/`Darwin` in its User-Agent),
 * the Android app through Android's (`Dalvik`, `okhttp`, `Android`). Else the
 * name the app paired with ("Ana's iPhone", "Pixel 8"). Null when unknown.
 */
export function phonePlatformOf(
  userAgent: string | null | undefined,
  name?: string | null,
): PhonePlatform | null {
  const ua = userAgent ?? ''
  if (/CFNetwork|Darwin|iPhone|iPad|iOS/i.test(ua)) return 'ios'
  if (/Android|Dalvik|okhttp/i.test(ua)) return 'android'
  const n = name ?? ''
  if (/\b(iPhone|iPad|iPod)\b/i.test(n)) return 'ios'
  if (/\b(Android|Pixel|Galaxy|OnePlus|Samsung|Xiaomi|Moto|Nothing)\b/i.test(n)) return 'android'
  return null
}

const g = globalThis as unknown as { __adhxPhonePlatformNoted?: Set<string> }

/** Store a phone key's platform the first time a request from it says which. Never throws. */
export function notePhonePlatform(
  keyId: string,
  userAgent: string | null | undefined,
  name?: string | null,
): void {
  const noted = (g.__adhxPhonePlatformNoted ??= new Set())
  if (noted.has(keyId)) return
  const platform = phonePlatformOf(userAgent, name)
  if (!platform) return
  try {
    db.update(accessKeys)
      .set({ platform })
      .where(and(eq(accessKeys.id, keyId), isNull(accessKeys.platform)))
      .run()
    noted.add(keyId)
  } catch {
    // Older database without the column: try again next time.
  }
}

/** A visit: activity after this long apart counts as opening ADHX again. */
export const OPEN_GAP_MS = 30 * 60 * 1000

export type OpenClient = 'web' | PhonePlatform | 'phone'

const opens = globalThis as unknown as { __adhxLastActive?: Map<string, number> }

/**
 * Count an "open" (analytics `app.open`, with the client as its source) when
 * this person comes back to this client after half an hour or more. Counts
 * only: nothing about what they opened. Kept in memory, so a restart counts
 * one more open for whoever is active.
 */
export function noteOpen(userId: string, client: OpenClient, now = Date.now()): boolean {
  if (!userId) return false
  const map = (opens.__adhxLastActive ??= new Map())
  const k = `${userId}:${client}`
  const last = map.get(k)
  map.set(k, now)
  if (map.size > 5000) map.delete(map.keys().next().value as string)
  if (last !== undefined && now - last < OPEN_GAP_MS) return false
  recordAnalytic({ name: 'app.open', source: client, userId })
  return true
}

/** Tests only. */
export function __resetOpens(): void {
  opens.__adhxLastActive = undefined
  g.__adhxPhonePlatformNoted = undefined
}

/** Everything a phone-key request says about its person: last seen, its kind of phone, an open. */
export function notePhoneRequest(
  caller: { userId: string; keyId: string; name: string },
  userAgent: string | null | undefined,
): void {
  touchLastSeen(caller.userId)
  notePhonePlatform(caller.keyId, userAgent, caller.name)
  noteOpen(caller.userId, phonePlatformOf(userAgent, caller.name) ?? 'phone')
}
