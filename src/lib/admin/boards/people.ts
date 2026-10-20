import { and, eq, sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { accessKeys, bookmarks, users } from '@/lib/db/schema'
import { inviteCode, inviteMode, type InviteMode } from '@/lib/auth/invites'
import { listJoinRequests, type JoinRequest } from '@/lib/auth/approval'
import { readBannedUserIds, writeAudit } from '@/lib/admin/moderation'
import { emojiForKind } from '@/lib/admin/counts'
import { networkLabel } from '@/lib/platform/networks'
import {
  facesById,
  isoTime,
  lastDays,
  num,
  perDay,
  postCards,
  sharedSavers,
  type Face,
  type PostCard,
} from '../shared'

/**
 * Admin → People (board 10.2) and A person (10.10). Counts include Just for
 * me saves; a Just for me post is never listed. Never shows what anyone
 * searched or which posts they watched (only how many).
 */

export interface AdminMember extends Face {
  role: 'admin' | 'member'
  isYou: boolean
  banned: boolean
  joinedAt: string | null
  lastSeenAt: string | null
  invitedBy: Face | null
  saves: number
  privateSaves: number
  notes: number
  sends: number
  reactions: number
  channels: number
  phones: number
}

export interface PeopleBoard {
  members: AdminMember[]
  requests: JoinRequest[]
  inviteMode: InviteMode
  invites: { waiting: number; used: number; codes: string[] }
  phones: { total: number; ios: number; android: number; unknown: number }
  admins: number
}

interface MemberRow {
  id: string
  username: string
  role: string
  created_at: string | null
  last_seen_at: string | null
}

/** Who brought each account in: the maker of the invite they joined with, by account id. */
function invitersOf(ids: string[]): Map<string, string> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  const rows = db.all<{ used_by: string; created_by: string }>(sql`
    SELECT used_by, created_by FROM invites
    WHERE used_by IS NOT NULL
    ORDER BY used_at ASC`)
  for (const r of rows) if (!out.has(r.used_by)) out.set(r.used_by, r.created_by)
  return out
}

function countsBy(query: ReturnType<typeof sql>): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of db.all<{ id: string; n: number }>(query)) out.set(r.id, num(r.n))
  return out
}

/** Everyone who can use this server (approved), banned ones flagged. */
export function adminMembers(viewerId: string): AdminMember[] {
  const rows = db.all<MemberRow>(sql`
    SELECT id, username, role, created_at, last_seen_at FROM users
    WHERE approval = 'approved'`)
  const ids = rows.map((r) => r.id)
  const faces = facesById(ids)
  const inviters = invitersOf(ids)
  const inviterFaces = facesById([...inviters.values()])
  const banned = readBannedUserIds()
  const bannedIds = banned.ok ? banned.value : new Set<string>()

  const saves = countsBy(sql`
    SELECT user_id AS id, COUNT(*) AS n FROM bookmarks
    WHERE COALESCE(source, '') != 'quoted' GROUP BY user_id`)
  const privateSaves = countsBy(sql`
    SELECT user_id AS id, COUNT(*) AS n FROM bookmarks
    WHERE COALESCE(source, '') != 'quoted' AND is_private = 1 GROUP BY user_id`)
  const notes = countsBy(sql`
    SELECT user_id AS id, COUNT(*) AS n FROM bookmarks
    WHERE note IS NOT NULL AND is_private = 0 AND COALESCE(source, '') != 'quoted'
    GROUP BY user_id`)
  const sends = countsBy(sql`
    SELECT from_user_id AS id, COUNT(*) AS n FROM post_sends GROUP BY from_user_id`)
  const reactions = countsBy(sql`
    SELECT user_id AS id, SUM(count) AS n FROM reaction_counts GROUP BY user_id`)
  const channels = countsBy(sql`
    SELECT user_id AS id, COUNT(DISTINCT tag) AS n FROM bookmark_tags GROUP BY user_id`)
  const phones = countsBy(sql`
    SELECT user_id AS id, COUNT(*) AS n FROM access_keys WHERE scope = 'phone' GROUP BY user_id`)

  const members: AdminMember[] = rows.map((r) => {
    const face = faces.get(r.id) ?? { username: r.username, name: null, avatarUrl: null }
    const inviter = inviters.get(r.id)
    return {
      ...face,
      role: r.role === 'admin' ? 'admin' : 'member',
      isYou: r.id === viewerId,
      banned: bannedIds.has(r.id),
      joinedAt: isoTime(r.created_at),
      lastSeenAt: isoTime(r.last_seen_at),
      invitedBy: inviter ? (inviterFaces.get(inviter) ?? null) : null,
      saves: saves.get(r.id) ?? 0,
      privateSaves: privateSaves.get(r.id) ?? 0,
      notes: notes.get(r.id) ?? 0,
      sends: sends.get(r.id) ?? 0,
      reactions: reactions.get(r.id) ?? 0,
      channels: channels.get(r.id) ?? 0,
      phones: phones.get(r.id) ?? 0,
    }
  })
  // You first, then by when they joined.
  return members.sort(
    (a, b) =>
      Number(b.isYou) - Number(a.isYou) ||
      (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '') ||
      a.username.localeCompare(b.username),
  )
}

export function peopleBoard(viewerId: string, now = Date.now()): PeopleBoard {
  const members = adminMembers(viewerId)
  const waiting = db.all<{ id: string }>(sql`
    SELECT i.id FROM invites i
    JOIN users m ON m.id = i.created_by
    WHERE i.used_by IS NULL AND i.revoked_at IS NULL AND i.expires_at > ${now}
      AND m.approval = 'approved'
      AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = m.id)
    ORDER BY i.created_at DESC`)
  const [used] = db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM invites WHERE used_by IS NOT NULL`,
  )
  const phoneRows = db.all<{ platform: string | null; n: number }>(sql`
    SELECT k.platform, COUNT(*) AS n FROM access_keys k
    JOIN users u ON u.id = k.user_id AND u.approval = 'approved'
    WHERE k.scope = 'phone' GROUP BY k.platform`)
  const phones = { total: 0, ios: 0, android: 0, unknown: 0 }
  for (const r of phoneRows) {
    phones.total += num(r.n)
    if (r.platform === 'ios') phones.ios += num(r.n)
    else if (r.platform === 'android') phones.android += num(r.n)
    else phones.unknown += num(r.n)
  }
  return {
    members,
    requests: listJoinRequests({}, now),
    inviteMode: inviteMode(),
    invites: {
      waiting: waiting.length,
      used: num(used?.n),
      codes: waiting.slice(0, 4).map((r) => inviteCode(r.id)),
    },
    phones,
    admins: members.filter((m) => m.role === 'admin' && !m.banned).length,
  }
}

// ——— A person ———

export interface AdminPhone {
  id: string
  name: string
  hint: string
  platform: 'ios' | 'android' | null
  createdAt: string
  lastUsedAt: string | null
}

export interface PersonSave extends PostCard {
  savedAt: string
  note: string | null
  savers: Face[]
}

export interface PersonBoard {
  member: AdminMember
  /** Their saves per day, last 30 days, oldest first: shared and Just for me. */
  days: { day: string; shared: number; private: number }[]
  /** "Mostly YouTube and Reddit · busiest on Sunday evenings". */
  habits: string | null
  sendsWatched: number
  topReaction: string | null
  publicChannels: number
  /** How many posts they watched in the last 30 days. A count, never which. */
  watched30d: number
  /** Their newest shared saves (never a Just for me save). */
  sharedSaves: PersonSave[]
  phones: AdminPhone[]
  broughtIn: Face[]
  waitingInvites: string[]
  /** Whether this is the only admin (they can't step down). */
  lastAdmin: boolean
}

const DAY_PARTS: [number, string][] = [
  [5, 'nights'],
  [12, 'mornings'],
  [17, 'afternoons'],
  [22, 'evenings'],
  [24, 'nights'],
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function partOfDay(hour: number): string {
  return DAY_PARTS.find(([end]) => hour < end)![1]
}

/** "Mostly YouTube and Reddit · busiest on Sunday evenings", from save times and networks. */
export function habitsLine(saves: { platform: string; at: string }[]): string | null {
  if (!saves.length) return null
  const nets = new Map<string, number>()
  const slots = new Map<string, number>()
  for (const s of saves) {
    nets.set(s.platform, (nets.get(s.platform) ?? 0) + 1)
    const d = new Date(s.at)
    if (Number.isNaN(d.getTime())) continue
    const slot = `${WEEKDAYS[d.getDay()]} ${partOfDay(d.getHours())}`
    slots.set(slot, (slots.get(slot) ?? 0) + 1)
  }
  const top = [...nets.entries()].sort((a, b) => b[1] - a[1])
  const names = top
    .filter(([, n], i) => i === 0 || n >= top[0][1] / 3)
    .slice(0, 2)
    .map(([p]) => networkLabel(p))
  const slot = [...slots.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const parts = [`Mostly ${names.join(' and ')}`]
  if (slot && saves.length >= 5) parts.push(`busiest on ${slot}`)
  return parts.join(' · ')
}

export function userIdForUsername(username: string): string | null {
  const clean = username.trim().replace(/^@/, '')
  if (!clean) return null
  const [row] = db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${clean.toLowerCase()}`)
    .limit(1)
    .all()
  return row?.id ?? null
}

export function personBoard(
  viewerId: string,
  username: string,
  now = Date.now(),
): PersonBoard | null {
  const userId = userIdForUsername(username)
  if (!userId) return null
  const member = adminMembers(viewerId).find((m) => m.username === getUsername(userId))
  if (!member) return null

  const days = lastDays(30, now)
  const since30 = new Date(now - 31 * 24 * 60 * 60_000).toISOString()
  const recent = db.all<{ at: string; is_private: number; platform: string }>(sql`
    SELECT processed_at AS at, is_private, platform FROM bookmarks
    WHERE user_id = ${userId} AND COALESCE(source, '') != 'quoted' AND processed_at >= ${since30}`)
  const shared = perDay(
    days,
    recent.filter((r) => !r.is_private).map((r) => r.at),
  )
  const priv = perDay(
    days,
    recent.filter((r) => r.is_private).map((r) => r.at),
  )
  const all = db.all<{ at: string; platform: string }>(sql`
    SELECT processed_at AS at, platform FROM bookmarks
    WHERE user_id = ${userId} AND COALESCE(source, '') != 'quoted'
    ORDER BY processed_at DESC LIMIT 1000`)

  const [sendsWatched] = db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM post_sends WHERE from_user_id = ${userId} AND seen_at IS NOT NULL`)
  const [topKind] = db.all<{ kind: string; n: number }>(sql`
    SELECT kind, SUM(count) AS n FROM reaction_counts WHERE user_id = ${userId}
    GROUP BY kind ORDER BY n DESC LIMIT 1`)
  const [publicChannels] = db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM tag_shares WHERE user_id = ${userId} AND is_public = 1`)
  const [watched] = db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM post_views
    WHERE user_id = ${userId} AND seen_at >= ${new Date(now - 30 * 24 * 60 * 60_000).toISOString()}`)

  // Their newest shared saves. Just for me saves are counted above, never listed.
  const sharedRows = db.all<{ platform: string; id: string; at: string; note: string | null }>(sql`
    SELECT platform, id, processed_at AS at, note FROM bookmarks
    WHERE user_id = ${userId} AND is_private = 0 AND COALESCE(source, '') != 'quoted'
    ORDER BY processed_at DESC LIMIT 8`)
  const keys = sharedRows.map((r) => `${r.platform}:${r.id}`)
  const cards = postCards(keys)
  const savers = sharedSavers(keys)
  const sharedSaves: PersonSave[] = []
  for (const r of sharedRows) {
    const k = `${r.platform}:${r.id}`
    const card = cards.get(k)
    if (!card) continue
    sharedSaves.push({ ...card, savedAt: r.at, note: r.note, savers: savers.get(k) ?? [] })
  }

  const phones: AdminPhone[] = db
    .select({
      id: accessKeys.id,
      name: accessKeys.name,
      hint: accessKeys.hint,
      platform: accessKeys.platform,
      createdAt: accessKeys.createdAt,
      lastUsedAt: accessKeys.lastUsedAt,
    })
    .from(accessKeys)
    .where(and(eq(accessKeys.userId, userId), eq(accessKeys.scope, 'phone')))
    .orderBy(accessKeys.createdAt)
    .all()
    .map((p) => ({
      ...p,
      platform: p.platform === 'ios' || p.platform === 'android' ? p.platform : null,
    }))

  const brought = db.all<{ id: string }>(sql`
    SELECT i.used_by AS id FROM invites i JOIN users u ON u.id = i.used_by
    WHERE i.created_by = ${userId} AND u.approval = 'approved'
    ORDER BY i.used_at ASC`)
  const broughtFaces = facesById(brought.map((b) => b.id))
  const waiting = db.all<{ id: string }>(sql`
    SELECT id FROM invites
    WHERE created_by = ${userId} AND used_by IS NULL AND revoked_at IS NULL AND expires_at > ${now}
    ORDER BY created_at DESC`)

  const admins = adminMembers(viewerId).filter((m) => m.role === 'admin' && !m.banned)
  return {
    member,
    days: days.map((day, i) => ({ day, shared: shared[i], private: priv[i] })),
    habits: habitsLine(all),
    sendsWatched: num(sendsWatched?.n),
    topReaction: topKind ? (emojiForKind(topKind.kind) ?? 'words') : null,
    publicChannels: num(publicChannels?.n),
    watched30d: num(watched?.n),
    sharedSaves,
    phones,
    broughtIn: brought.map((b) => broughtFaces.get(b.id)).filter((f): f is Face => !!f),
    waitingInvites: waiting.map((w) => inviteCode(w.id)),
    lastAdmin: member.role === 'admin' && admins.length <= 1,
  }
}

function getUsername(userId: string): string | null {
  const [row] = db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .all()
  return row?.username ?? null
}

// ——— Actions ———

export type ActionResult = { ok: true } | { ok: false; status: number; error: string }

/**
 * Make someone an admin, or take it away. Written to the audit log. The last
 * admin can't be removed (so nobody can lock the server out of its admin
 * area), a kept-out account can't be made one, and only members who are let
 * in can be.
 */
export function setAdminRole(
  actorUserId: string,
  username: string,
  makeAdmin: boolean,
): ActionResult & { role?: 'admin' | 'user' } {
  const userId = userIdForUsername(username)
  if (!userId) return { ok: false, status: 404, error: 'No one by that name.' }
  return runInTransaction(() => {
    const [target] = db
      .select({ role: users.role, approval: users.approval, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .all()
    if (!target || target.approval !== 'approved') {
      return { ok: false as const, status: 404, error: 'No one by that name.' }
    }
    const banned = readBannedUserIds()
    if (makeAdmin) {
      if (!banned.ok || banned.value.has(userId)) {
        return {
          ok: false as const,
          status: 409,
          error: 'Let them back in before making them an admin.',
        }
      }
      if (target.role === 'admin') return { ok: true as const, role: 'admin' as const }
      db.update(users).set({ role: 'admin' }).where(eq(users.id, userId)).run()
      writeAudit(actorUserId, 'make_admin', { username: target.username })
      return { ok: true as const, role: 'admin' as const }
    }
    if (target.role !== 'admin') return { ok: true as const, role: 'user' as const }
    const [others] = db.all<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM users
      WHERE role = 'admin' AND id != ${userId} AND approval = 'approved'
        AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = users.id)`)
    if (num(others?.n) === 0) {
      return {
        ok: false as const,
        status: 409,
        error: 'Every ADHX needs an admin. Make someone else one first.',
      }
    }
    db.update(users).set({ role: 'user' }).where(eq(users.id, userId)).run()
    writeAudit(actorUserId, 'remove_admin', { username: target.username })
    return { ok: true as const, role: 'user' as const }
  })
}

/** Remove one of a member's phones (its key stops working at once). Audited. */
export function removeMemberPhone(
  actorUserId: string,
  username: string,
  phoneId: string,
): ActionResult {
  const userId = userIdForUsername(username)
  if (!userId) return { ok: false, status: 404, error: 'No one by that name.' }
  const [row] = db
    .select({ hint: accessKeys.hint, name: accessKeys.name })
    .from(accessKeys)
    .where(
      and(eq(accessKeys.id, phoneId), eq(accessKeys.userId, userId), eq(accessKeys.scope, 'phone')),
    )
    .all()
  if (!row) return { ok: false, status: 404, error: 'That phone isn’t connected.' }
  db.delete(accessKeys).where(eq(accessKeys.id, phoneId)).run()
  writeAudit(actorUserId, 'remove_phone', { username: getUsername(userId), hint: row.hint })
  return { ok: true }
}

/** Clear every note a member left. Audited (how many, never what they said). */
export function clearMemberNotes(
  actorUserId: string,
  username: string,
): ActionResult & { notesCleared?: number } {
  const userId = userIdForUsername(username)
  if (!userId) return { ok: false, status: 404, error: 'No one by that name.' }
  const notesCleared = db
    .update(bookmarks)
    .set({ note: null })
    .where(and(eq(bookmarks.userId, userId), sql`${bookmarks.note} IS NOT NULL`))
    .run().changes
  writeAudit(actorUserId, 'clear_note', { username: getUsername(userId), notesCleared })
  return { ok: true, notesCleared }
}
