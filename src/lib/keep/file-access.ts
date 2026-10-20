import crypto from 'crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { visibleSave } from '@/lib/people/savers'

/**
 * Who may fetch a post's kept files (`/api/files/{platform}/{id}/{slot}`).
 *
 * Shared posts are served to anyone who asks, as before (previews, phones and
 * the web all load them by URL). A post whose only saves are Just for me is
 * its owners' alone: a signed-in owner (session or phone key) or a request
 * carrying the post's file token (`?k=`), which the server adds only to an
 * owner's own media URLs, because phone video players can't send headers.
 * Anyone else gets exactly what an unsaved post would get, so a stranger
 * can't learn that someone saved it.
 */

export type KeptFileAccess = 'shared' | 'private' | 'unsaved'

/**
 * `shared`: someone's shared save, or a quoted copy shown inside another
 * post. `private`: saves exist, all Just for me. `unsaved`: nobody has it.
 */
export function keptFileAccess(platform: string, id: string): KeptFileAccess {
  const [row] = db.all<{ visible: number | null; quoted: number | null; saves: number }>(sql`
    SELECT
      MAX(CASE WHEN ${visibleSave('b')} THEN 1 ELSE 0 END) AS visible,
      MAX(CASE WHEN COALESCE(b.source, '') = 'quoted' THEN 1 ELSE 0 END) AS quoted,
      COUNT(*) AS saves
    FROM bookmarks b
    WHERE b.platform = ${platform} AND b.id = ${id}
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
        AND COALESCE(source, '') != 'quoted'
      LIMIT 1
    `).length > 0
  )
}

function secret(): string {
  const value = process.env.SESSION_SECRET || process.env.TWITTER_CLIENT_SECRET
  if (value) return value
  if (process.env.NODE_ENV === 'test') return 'test-secret-for-vitest-only'
  throw new Error('SESSION_SECRET or TWITTER_CLIENT_SECRET is required to sign file links.')
}

/** The post's file token: covers every slot of that one post, never another. */
export function fileToken(platform: string, id: string): string {
  return crypto
    .createHmac('sha256', secret())
    .update(`kept-file:${platform}:${id}`)
    .digest('base64url')
    .slice(0, 32)
}

export function validFileToken(platform: string, id: string, token: string | null): boolean {
  if (!token || token.length !== 32) return false
  const expected = Buffer.from(fileToken(platform, id))
  const given = Buffer.from(token)
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

/**
 * Adds the post's file token to one of its own `/api/files` URLs (other URLs
 * are returned as they are). Only for an owner's view of their own save.
 */
export function withFileToken(
  url: string | null | undefined,
  platform: string,
  id: string,
): string | null {
  if (!url) return url ?? null
  const prefix = `/api/files/${encodeURIComponent(platform)}/${encodeURIComponent(id)}/`
  if (!url.startsWith(prefix)) return url
  const [path, query = ''] = url.split('?', 2)
  const params = new URLSearchParams(query)
  params.set('k', fileToken(platform, id))
  return `${path}?${params.toString()}`
}
