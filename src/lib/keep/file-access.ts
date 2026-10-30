import crypto from 'crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { serverSecret } from '@/lib/auth/server-secret'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { visibleSave } from '@/lib/people/savers'

/**
 * Who may fetch a post's kept files (`/api/files/{platform}/{id}/{slot}`).
 *
 * Shared posts are served to anyone who asks, as before (previews, phones and
 * the web all load them by URL). A post whose only saves are Just for me is
 * its owners' alone: a signed-in owner (session or phone key) or a request
 * carrying a file token (`?k=`), which the server adds only to an owner's own
 * media URLs on their phone, because phone video players can't send headers.
 * A token is tied to the phone key it was issued to and lasts a day: removing
 * the phone, or the save, stops it working.
 * Anyone else gets exactly what an unsaved post would get, so a stranger
 * can't learn that someone saved it.
 */

export type KeptFileAccess = 'shared' | 'private' | 'unsaved'

/**
 * Quotes inherit access from a live parent in the same account and platform.
 * A leftover quoted row cannot publish media after its parent disappears.
 */
export function keptFileAccess(platform: string, id: string): KeptFileAccess {
  const [row] = db.all<{ visible: number | null; quoted: number | null; saves: number }>(sql`
    SELECT
      MAX(CASE WHEN ${visibleSave('b')} THEN 1 ELSE 0 END) AS visible,
      MAX(CASE WHEN COALESCE(b.source, '') = 'quoted' AND b.is_private = 0 AND EXISTS (
        SELECT 1 FROM bookmarks p WHERE p.user_id = b.user_id AND p.platform = b.platform
          AND p.quoted_tweet_id = b.id AND ${visibleSave('p')}
          AND NOT EXISTS (SELECT 1 FROM moderated_posts m
            WHERE m.platform = p.platform AND m.bookmark_id = p.id AND m.hidden = 1)
      ) THEN 1 ELSE 0 END) AS quoted,
      SUM(CASE WHEN COALESCE(b.source, '') != 'quoted' OR EXISTS (
        SELECT 1 FROM bookmarks p WHERE p.user_id = b.user_id AND p.platform = b.platform
          AND p.quoted_tweet_id = b.id AND COALESCE(p.source, '') != 'quoted'
          AND NOT EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id = p.user_id)
          AND NOT EXISTS (SELECT 1 FROM moderated_posts m
            WHERE m.platform = p.platform AND m.bookmark_id = p.id AND m.hidden = 1)
      ) THEN 1 ELSE 0 END) AS saves
    FROM bookmarks b
    WHERE b.platform = ${platform} AND b.id = ${id}
      AND NOT EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id = b.user_id)
  `)
  if (!row || !row.saves) return 'unsaved'
  if (row.visible || row.quoted) return 'shared'
  return 'private'
}

/** Whether this account has its own save of the post. */
export function ownsSave(userId: string, platform: string, id: string): boolean {
  return (
    db.all(sql`
      SELECT 1 FROM bookmarks
      WHERE user_id = ${userId} AND platform = ${platform} AND id = ${id}
        AND (COALESCE(source, '') != 'quoted' OR EXISTS (
          SELECT 1 FROM bookmarks p WHERE p.user_id = bookmarks.user_id
            AND p.platform = bookmarks.platform AND p.quoted_tweet_id = bookmarks.id
            AND COALESCE(p.source, '') != 'quoted'
            AND NOT EXISTS (SELECT 1 FROM moderated_posts m
              WHERE m.platform = p.platform AND m.bookmark_id = p.id AND m.hidden = 1)
        ))
      LIMIT 1
    `).length > 0
  )
}

/** Whose phone the current request's file links are for (set by `withPhoneKey`). */
export interface FileGrant {
  userId: string
  keyId: string
}

// On globalThis: Next bundles a route and the modules it imports as separate copies.
const g = globalThis as unknown as { __adhxFileGrants?: AsyncLocalStorage<FileGrant> }
const grants = (g.__adhxFileGrants ??= new AsyncLocalStorage<FileGrant>())

/** Runs a phone request so the private media URLs it hands out carry this key's tokens. */
export function withFileGrant<T>(grant: FileGrant, fn: () => T): T {
  return grants.run(grant, fn)
}

/** Long enough to play through a feed; the apps also send their key with each file. */
export const FILE_TOKEN_MS = 24 * 60 * 60 * 1000

const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/

function signature(platform: string, id: string, keyId: string, expires: string): string {
  return crypto
    .createHmac('sha256', serverSecret())
    .update(`kept-file:v2:${platform}:${id}:${keyId}:${expires}`)
    .digest('base64url')
    .slice(0, 32)
}

/** A file token for one post's files, for one phone key, until `expires` (ms). */
export function fileToken(
  platform: string,
  id: string,
  keyId: string,
  expires = Date.now() + FILE_TOKEN_MS,
): string {
  const at = Math.ceil(expires / 1000).toString(36)
  return `${at}.${keyId}.${signature(platform, id, keyId, at)}`
}

/**
 * True while the token is unexpired, its phone key still exists, and that
 * key's account still has its own save of the post.
 */
export function validFileToken(platform: string, id: string, token: string | null): boolean {
  const [at, keyId, sig, extra] = token?.split('.') ?? []
  if (extra !== undefined || !at || !keyId || !sig || !KEY_ID.test(keyId)) return false
  if (!/^[0-9a-z]{1,10}$/.test(at)) return false
  const expires = Number.parseInt(at, 36) * 1000
  const now = Date.now()
  if (!(expires > now) || expires > now + FILE_TOKEN_MS + 60_000) return false
  const expected = Buffer.from(signature(platform, id, keyId, at))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false
  const [key] = db.all<{ user_id: string }>(
    sql`SELECT user_id FROM access_keys WHERE id = ${keyId} AND scope = 'phone' LIMIT 1`,
  )
  return !!key && ownsSave(key.user_id, platform, id)
}

/**
 * Adds a file token to one of the post's own `/api/files` URLs (other URLs
 * are returned as they are). Only for an owner's view of their own save, and
 * only inside a phone request (`withFileGrant`): the web sends its session.
 */
export function withFileToken(
  url: string | null | undefined,
  platform: string,
  id: string,
): string | null {
  if (!url) return url ?? null
  const grant = grants.getStore()
  if (!grant) return url
  const prefix = `/api/files/${encodeURIComponent(platform)}/${encodeURIComponent(id)}/`
  if (!url.startsWith(prefix)) return url
  const [path, query = ''] = url.split('?', 2)
  const params = new URLSearchParams(query)
  params.set('k', fileToken(platform, id, grant.keyId))
  return `${path}?${params.toString()}`
}
