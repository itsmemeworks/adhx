import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { GROUP_LINK_MAX_USES, inviteCode, inviteMode, type InviteMode } from '@/lib/auth/invites'
import { listJoinRequests, type JoinRequest } from '@/lib/auth/approval'
import { pendingAdminSignInLinks, signInDelivery } from '@/lib/email/magic-link'
import { previewPathFor } from '@/lib/admin/moderation'
import { channelTitle } from '@/components/next/channels/title'
import { facesById, num, postCards, type Face } from '../shared'

/**
 * Admin → Moderation (board 10.8) and Invites (10.9).
 */

export interface HiddenPost {
  platform: string
  id: string
  title: string
  thumbnail: string | null
  reason: string | null
  hiddenBy: Face | null
  hiddenAt: string
  previewPath: string
}

export interface KeptOut {
  face: Face
  reason: string | null
  at: string
  by: Face | null
}

export interface AuditLine {
  actor: Face | null
  verb: string
  target: string
  at: string
}

export interface ModerationBoard {
  hidden: HiddenPost[]
  keptOut: KeptOut[]
  log: AuditLine[]
}

/** A hidden post's title: a shared save's words, else its public pulse, else its network. */
function hiddenTitles(keys: string[]): Map<string, { title: string; thumbnail: string | null }> {
  const out = new Map<string, { title: string; thumbnail: string | null }>()
  const cards = postCards(keys)
  for (const k of keys) {
    const card = cards.get(k)
    if (card) {
      out.set(k, { title: card.title, thumbnail: card.thumbnail })
      continue
    }
    const at = k.indexOf(':')
    const [pulse] = db.all<{
      text: string | null
      author: string | null
      thumb: string | null
    }>(sql`
      SELECT text, author, thumbnail_url AS thumb FROM activity
      WHERE platform = ${k.slice(0, at)} AND bookmark_id = ${k.slice(at + 1)}
      ORDER BY created_at DESC LIMIT 1`)
    const words = pulse?.text
      ?.split('\n')
      .find((l) => l.trim())
      ?.trim()
    out.set(k, {
      title: words || (pulse?.author ? `A post by @${pulse.author}` : 'A hidden post'),
      thumbnail: pulse?.thumb ?? null,
    })
  }
  return out
}

function parseTarget(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const MODE_WORDS: Record<string, string> = {
  admin: 'only admins invite',
  approve: 'anyone invites, an admin approves',
  anyone: 'anyone invites',
}

export function moderationBoard(now = Date.now()): ModerationBoard {
  const hiddenRows = db.all<{
    platform: string
    bookmark_id: string
    reason: string | null
    content_type: string | null
    created_at: string
    created_by: string
  }>(sql`
    SELECT platform, bookmark_id, reason, content_type, created_at, created_by
    FROM moderated_posts WHERE hidden = 1 ORDER BY created_at DESC LIMIT 50`)
  const keys = hiddenRows.map((r) => `${r.platform}:${r.bookmark_id}`)
  const titles = hiddenTitles(keys)

  const banRows = db.all<{
    user_id: string
    reason: string | null
    created_at: string
    created_by: string
  }>(sql`SELECT user_id, reason, created_at, created_by FROM user_bans ORDER BY created_at DESC`)

  const since = new Date(now - 30 * 24 * 60 * 60_000).toISOString()
  const auditRows = db.all<{
    actor_user_id: string
    action: string
    target: string | null
    created_at: string
  }>(sql`
    SELECT actor_user_id, action, target, created_at FROM admin_audit
    WHERE created_at >= ${since} ORDER BY created_at DESC, id DESC LIMIT 40`)

  const faces = facesById([
    ...hiddenRows.map((r) => r.created_by),
    ...banRows.flatMap((r) => [r.user_id, r.created_by]),
    ...auditRows.map((r) => r.actor_user_id),
  ])
  // Audit targets name people by username.
  const names = new Set<string>()
  for (const r of auditRows) {
    const t = parseTarget(r.target)
    if (typeof t.username === 'string') names.add(t.username)
  }
  const byName = new Map<string, Face>()
  if (names.size) {
    const rows = db.all<{ id: string; username: string }>(sql`
      SELECT id, username FROM users WHERE username IN (${sql.join(
        [...names].map((n) => sql`${n}`),
        sql`, `,
      )})`)
    const f = facesById(rows.map((r) => r.id))
    for (const r of rows) {
      const face = f.get(r.id)
      if (face) byName.set(r.username, face)
    }
  }
  const nameOf = (username: unknown) =>
    typeof username === 'string' ? (byName.get(username)?.name ?? username) : 'someone'
  const postKeys = auditRows
    .map((r) => parseTarget(r.target))
    .filter((t) => typeof t.platform === 'string' && typeof t.bookmarkId === 'string')
    .map((t) => `${t.platform}:${t.bookmarkId}`)
  const postTitles = hiddenTitles([...new Set(postKeys)])
  const postOf = (t: Record<string, unknown>) => {
    const title = postTitles.get(`${t.platform}:${t.bookmarkId}`)?.title ?? 'a post'
    return Array.from(title).length > 40 ? `${Array.from(title).slice(0, 39).join('')}…` : title
  }

  const log: AuditLine[] = auditRows.map((r) => {
    const t = parseTarget(r.target)
    const actor = faces.get(r.actor_user_id) ?? null
    const line = (verb: string, target: string) => ({ actor, verb, target, at: r.created_at })
    switch (r.action) {
      case 'hide_post':
        return line('hid', postOf(t))
      case 'unhide_post':
        return line('showed again', postOf(t))
      case 'hide_playlist':
        return line('hid the channel', channelTitle(String(t.tag ?? '')))
      case 'unhide_playlist':
        return line('showed the channel', channelTitle(String(t.tag ?? '')))
      case 'ban_user':
        return line('kept out', nameOf(t.username))
      case 'unban_user':
        return line('let back in', nameOf(t.username))
      case 'approve_join':
        return line('let in', nameOf(t.username))
      case 'decline_join':
        return line('turned away', nameOf(t.username))
      case 'set_invite_mode':
        return line('set invites to', MODE_WORDS[String(t.mode)] ?? String(t.mode ?? ''))
      case 'clear_note':
        return typeof t.platform === 'string'
          ? line(
              t.username ? `cleared ${nameOf(t.username)}’s note on` : 'cleared notes on',
              postOf(t),
            )
          : line('cleared the notes of', nameOf(t.username))
      case 'make_admin':
        return line('made', `${nameOf(t.username)} an admin`)
      case 'remove_admin':
        return line('removed', `${nameOf(t.username)} as an admin`)
      case 'remove_phone':
        return line('removed a phone of', nameOf(t.username))
      case 'pause_work':
        return line('paused', 'new work')
      case 'resume_work':
        return line('resumed', 'new work')
      case 'retry_failed':
        return line('retried', typeof t.platform === 'string' ? postOf(t) : 'failed work')
      case 'keep_link_only':
        return line('kept as a link', postOf(t))
      case 'set_setting':
        return line(t.cleared ? 'cleared' : 'changed', String(t.name ?? 'a setting'))
      case 'test_service':
        return line('tested', String(t.service ?? 'a service'))
      default:
        return line(r.action.replace(/_/g, ' '), '')
    }
  })

  return {
    hidden: hiddenRows.map((r) => {
      const k = `${r.platform}:${r.bookmark_id}`
      const t = titles.get(k)
      return {
        platform: r.platform,
        id: r.bookmark_id,
        title: t?.title ?? 'A hidden post',
        thumbnail: t?.thumbnail ?? null,
        reason: r.reason,
        hiddenBy: faces.get(r.created_by) ?? null,
        hiddenAt: r.created_at,
        previewPath: previewPathFor(r.platform, null, r.bookmark_id, r.content_type),
      }
    }),
    keptOut: banRows
      .map((r) => ({
        face: faces.get(r.user_id)!,
        reason: r.reason,
        at: r.created_at,
        by: faces.get(r.created_by) ?? null,
      }))
      .filter((k) => k.face),
    log,
  }
}

// ——— Invites ———

export interface InviteRow {
  id: string
  code: string
  by: Face | null
  createdAt: string
  expiresAt: number
  state: 'waiting' | 'used' | 'expired' | 'cancelled'
  usedBy: Face | null
  /** The person who used it is waiting for an admin. */
  usedByWaiting: boolean
  /** A group link: `joined` people used it (of `maxUses`), `joinedWaiting` still waiting. */
  group: { joined: number; maxUses: number; joinedWaiting: number } | null
}

export interface InvitesBoard {
  mode: InviteMode
  admins: Face[]
  requests: JoinRequest[]
  links: InviteRow[]
  /** How many people one group link lets in. */
  groupMaxUses: number
  waiting: number
  used: number
  signIn: {
    delivery: string | null
    links: {
      tokenHash: string
      face: Face | null
      email: string
      url: string
      createdAt: string
      expiresAt: number
    }[]
  }
}

export function invitesBoard(now = Date.now()): InvitesBoard {
  const adminRows = db.all<{ id: string }>(sql`
    SELECT id FROM users u WHERE role = 'admin' AND approval = 'approved'
      AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = u.id)
    ORDER BY created_at, id`)
  const recent = new Date(now - 30 * 24 * 60 * 60_000).toISOString()
  const rows = db.all<{
    id: string
    created_by: string
    created_at: string
    expires_at: number
    used_by: string | null
    used_at: string | null
    revoked_at: string | null
    used_approval: string | null
    max_uses: number | null
    uses: number
    joined_waiting: number
  }>(sql`
    SELECT i.id, i.created_by, i.created_at, i.expires_at, i.used_by, i.used_at, i.revoked_at,
      u.approval AS used_approval, i.max_uses, i.uses,
      (SELECT COUNT(*) FROM invites j JOIN users ju ON ju.id = j.used_by
        WHERE j.group_id = i.id AND ju.approval = 'pending') AS joined_waiting
    FROM invites i LEFT JOIN users u ON u.id = i.used_by
    -- A join through a group link is counted on the link, not listed.
    WHERE i.group_id IS NULL
      AND ((i.used_by IS NULL AND i.revoked_at IS NULL AND i.expires_at > ${now}
            AND (i.max_uses IS NULL OR i.uses < i.max_uses))
        OR i.used_at >= ${recent}
        OR (i.max_uses IS NOT NULL AND i.created_at >= ${recent}))
    ORDER BY (i.used_by IS NULL AND i.revoked_at IS NULL AND i.expires_at > ${now}) DESC,
      i.created_at DESC
    LIMIT 30`)
  const faces = facesById([
    ...adminRows.map((r) => r.id),
    ...rows.flatMap((r) => [r.created_by, r.used_by ?? '']),
  ])
  const links: InviteRow[] = rows.map((r) => ({
    id: r.id,
    code: inviteCode(r.id),
    by: faces.get(r.created_by) ?? null,
    createdAt: r.created_at,
    expiresAt: num(r.expires_at),
    state: r.used_by
      ? 'used'
      : r.revoked_at
        ? 'cancelled'
        : num(r.expires_at) <= now
          ? 'expired'
          : r.max_uses !== null && num(r.uses) >= num(r.max_uses)
            ? 'used'
            : 'waiting',
    usedBy: r.used_by ? (faces.get(r.used_by) ?? null) : null,
    usedByWaiting: r.used_approval === 'pending',
    group:
      r.max_uses === null
        ? null
        : { joined: num(r.uses), maxUses: num(r.max_uses), joinedWaiting: num(r.joined_waiting) },
  }))
  const [used] = db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM invites WHERE used_by IS NOT NULL`,
  )

  const delivery = signInDelivery()
  const pending = delivery === 'admin' ? pendingAdminSignInLinks() : []
  const emailOwners = new Map<string, string>()
  if (pending.length) {
    for (const r of db.all<{ email: string; user_id: string }>(sql`
      SELECT provider_id AS email, user_id FROM user_identities
      WHERE provider = 'email' AND provider_id IN (${sql.join(
        pending.map((p) => sql`${p.email.toLowerCase()}`),
        sql`, `,
      )})`))
      emailOwners.set(r.email, r.user_id)
  }
  const ownerFaces = facesById([...emailOwners.values()])

  return {
    mode: inviteMode(),
    admins: adminRows.map((r) => faces.get(r.id)).filter((f): f is Face => !!f),
    requests: listJoinRequests({}, now),
    links,
    groupMaxUses: GROUP_LINK_MAX_USES,
    waiting: links.filter((l) => l.state === 'waiting').length,
    used: num(used?.n),
    signIn: {
      delivery,
      links: pending.map((p) => ({
        tokenHash: p.tokenHash,
        face: ownerFaces.get(emailOwners.get(p.email.toLowerCase()) ?? '') ?? null,
        email: p.email,
        url: p.url,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
      })),
    },
  }
}
