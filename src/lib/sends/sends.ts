import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { readModeratedPostKeys } from '@/lib/admin/moderation'
import { listMembers } from '@/lib/people/members'
import { cleanNote } from '@/lib/people/note-text'
import { visibleSave } from '@/lib/people/savers'

/**
 * "Send straight to your people" (board j4-4, docs/specs/friends-feed.md).
 *
 * A member sends a post they can see to other members. Named to friends,
 * never to strangers: only members are offered, and a private save is never
 * revealed. A post you can only see through your own private save isn't
 * sendable ("Just for you. Share it first to send it."); a post you can't
 * see at all is "not found". The recipient gets it first in New ("Pete sent
 * you this") until they've seen it (`markSendsSeen`).
 */

/** Recipients per send. */
export const MAX_SEND_TO = 20
/** Sends (requests) per user per minute. */
export const SEND_LIMIT = { windowMs: 60_000, max: 60 }

const PLATFORM = /^[a-z]{1,16}$/
const POST_ID = /^[A-Za-z0-9_-]{1,64}$/
const USERNAME = /^[A-Za-z0-9_]{1,40}$/

export interface SendPerson {
  username: string
  name: string | null
  avatarUrl: string | null
  /** They already have a shared save of it (a Just for me save is never revealed). */
  has: boolean
  /** You've already sent it to them. */
  sent: boolean
}

export interface SendTargets {
  sendable: boolean
  people: SendPerson[]
}

export type SkipReason = 'has' | 'sent' | 'unknown'

export interface SendResult {
  sent: string[]
  skipped: { username: string; reason: SkipReason }[]
}

export function validPost(platform: unknown, id: unknown): platform is string {
  return (
    typeof platform === 'string' &&
    PLATFORM.test(platform) &&
    typeof id === 'string' &&
    POST_ID.test(id)
  )
}

/**
 * Whether the viewer can see a save of the post, and whether it's sendable:
 * - `none`: no save they can see (someone else's private save doesn't count).
 * - `private`: only their own private save.
 * - `ok`: someone's visible save (theirs included).
 * Moderated posts count as `none`.
 */
export function postAccess(
  viewerId: string,
  platform: string,
  id: string,
): 'none' | 'private' | 'ok' {
  const moderated = readModeratedPostKeys()
  if (!moderated.ok) throw moderated.error
  if (moderated.value.has(`${platform}:${id}`)) return 'none'
  const [row] = db.all<{ visible: number | null; own: number | null }>(sql`
    SELECT
      MAX(CASE WHEN ${visibleSave('b')} THEN 1 ELSE 0 END) AS visible,
      MAX(CASE WHEN b.user_id = ${viewerId} AND COALESCE(b.source, '') != 'quoted' THEN 1 ELSE 0 END) AS own
    FROM bookmarks b
    WHERE b.platform = ${platform} AND b.id = ${id}
  `)
  if (row?.visible) return 'ok'
  if (row?.own) return 'private'
  return 'none'
}

/**
 * Members who already have a shared save of the post. A Just for me save
 * doesn't count: the sender must not learn about it, so that person is
 * offered and can be sent the post like anyone else.
 */
function holders(platform: string, id: string): Set<string> {
  const rows = db.all<{ user_id: string }>(sql`
    SELECT DISTINCT b.user_id FROM bookmarks b
    WHERE b.platform = ${platform} AND b.id = ${id} AND ${visibleSave('b')}
  `)
  return new Set(rows.map((r) => r.user_id))
}

function sentTo(fromId: string, platform: string, id: string): Set<string> {
  const rows = db.all<{ to_user_id: string }>(sql`
    SELECT to_user_id FROM post_sends
    WHERE from_user_id = ${fromId} AND platform = ${platform} AND post_id = ${id}
  `)
  return new Set(rows.map((r) => r.to_user_id))
}

/**
 * The send sheet's "Or straight to your people" row: one entry per member
 * (not you), most recent saver first. Null when the viewer can't see the post.
 */
export function sendTargets(viewerId: string, platform: string, id: string): SendTargets | null {
  const access = postAccess(viewerId, platform, id)
  if (access === 'none') return null
  if (access === 'private') return { sendable: false, people: [] }
  const has = holders(platform, id)
  const sent = sentTo(viewerId, platform, id)
  const people = listMembers(viewerId)
    .filter((m) => !m.isYou)
    .map((m) => ({
      username: m.username,
      name: m.name,
      avatarUrl: m.avatarUrl,
      has: has.has(m.userId),
      sent: sent.has(m.userId),
    }))
  return { sendable: true, people }
}

export type SendBody = { platform: string; id: string; to: string[]; note: string | null }

/** `{ platform, id, to: [username], note? }` → the body, or what's wrong. */
export function parseSendBody(body: unknown): SendBody | { error: string } {
  const b = body as { platform?: unknown; id?: unknown; to?: unknown; note?: unknown } | null
  if (!validPost(b?.platform, b?.id)) return { error: 'Send the post’s platform and id.' }
  if (!Array.isArray(b?.to) || b.to.length === 0) return { error: 'Say who to send it to.' }
  if (b.to.length > MAX_SEND_TO) return { error: `At most ${MAX_SEND_TO} people at a time.` }
  if (!b.to.every((u) => typeof u === 'string' && USERNAME.test(u))) {
    return { error: 'Each person is a username.' }
  }
  if (b.note !== undefined && b.note !== null && typeof b.note !== 'string') {
    return { error: 'A note is text.' }
  }
  const note = typeof b.note === 'string' ? cleanNote(b.note) : null
  return {
    platform: b.platform as string,
    id: b.id as string,
    to: [...new Set((b.to as string[]).map((u) => u.toLowerCase()))],
    note,
  }
}

/**
 * Send a post to members by username. Skips anyone who isn't another member
 * (`unknown`), already has it (`has`) or was already sent it by you (`sent`).
 * Null when you can't see the post; `'private'` when it's only your own
 * private save.
 */
export function sendPost(
  viewerId: string,
  body: SendBody,
  now = new Date(),
): SendResult | null | 'private' {
  const access = postAccess(viewerId, body.platform, body.id)
  if (access === 'none') return null
  if (access === 'private') return 'private'
  const members = new Map(
    listMembers(viewerId)
      .filter((m) => !m.isYou)
      .map((m) => [m.username.toLowerCase(), m]),
  )
  const has = holders(body.platform, body.id)
  const result: SendResult = { sent: [], skipped: [] }
  const createdAt = now.toISOString()
  runInTransaction(() => {
    const already = sentTo(viewerId, body.platform, body.id)
    for (const name of body.to) {
      const member = members.get(name)
      if (!member) {
        result.skipped.push({ username: name, reason: 'unknown' })
        continue
      }
      if (has.has(member.userId)) {
        result.skipped.push({ username: member.username, reason: 'has' })
        continue
      }
      if (already.has(member.userId)) {
        result.skipped.push({ username: member.username, reason: 'sent' })
        continue
      }
      db.run(sql`
        INSERT INTO post_sends (from_user_id, to_user_id, platform, post_id, note, created_at, seen_at)
        VALUES (${viewerId}, ${member.userId}, ${body.platform}, ${body.id}, ${body.note}, ${createdAt}, NULL)
        ON CONFLICT (from_user_id, to_user_id, platform, post_id) DO NOTHING
      `)
      already.add(member.userId)
      result.sent.push(member.username)
    }
  })
  return result
}

/** One unseen send to the viewer, newest first per post. */
export interface IncomingSend {
  key: string
  username: string
  name: string | null
  note: string | null
  /** epoch ms */
  at: number
}

/**
 * Posts sent to the viewer that they haven't seen yet, keyed `platform:id`,
 * each with its senders (newest first). Senders who are banned or waiting
 * for approval are left out.
 */
export function unseenSendsTo(viewerId: string): Map<string, IncomingSend[]> {
  const out = new Map<string, IncomingSend[]>()
  if (!viewerId) return out
  const rows = db.all<{
    platform: string
    post_id: string
    username: string
    display_name: string | null
    note: string | null
    created_at: string
  }>(sql`
    SELECT s.platform, s.post_id, u.username, u.display_name, s.note, s.created_at
    FROM post_sends s
    JOIN users u ON u.id = s.from_user_id
    WHERE s.to_user_id = ${viewerId} AND s.seen_at IS NULL
      AND u.approval = 'approved'
      AND NOT EXISTS (SELECT 1 FROM user_bans ub WHERE ub.user_id = s.from_user_id)
    ORDER BY s.created_at DESC
    LIMIT 200
  `)
  for (const r of rows) {
    const key = `${r.platform}:${r.post_id}`
    const list = out.get(key) ?? []
    list.push({
      key,
      username: r.username,
      name: r.display_name ?? null,
      note: r.note ?? null,
      at: Date.parse(r.created_at) || 0,
    })
    out.set(key, list)
  }
  return out
}

/** The viewer saw these posts: their sends stop leading New. */
export function markSendsSeen(
  userId: string,
  posts: { platform: string; id: string }[],
  now = new Date(),
): void {
  if (!userId || posts.length === 0) return
  const seenAt = now.toISOString()
  for (const p of posts) {
    db.run(sql`
      UPDATE post_sends SET seen_at = ${seenAt}
      WHERE to_user_id = ${userId} AND platform = ${p.platform} AND post_id = ${p.id}
        AND seen_at IS NULL
    `)
  }
}
