import { and, eq, sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { invites, userIdentities, users } from '@/lib/db/schema'
import { writeAudit } from '@/lib/admin/moderation'

/**
 * Join approvals ("Anyone, I approve"). Someone a member invites joins as
 * `pending`: their account exists and they're signed in, but
 * `getCurrentUserId()` treats them as signed out until an admin says yes.
 * Admins see them under "Waiting for you" in Settings → Your people.
 *
 * A request is named by the invite the person joined with (`inv_…`, already a
 * public handle), never by the account id.
 */

export type JoinDecision = 'approve' | 'not_now' | 'decline'
export const JOIN_DECISIONS: readonly JoinDecision[] = ['approve', 'not_now', 'decline']

/** "Not now" hides a request from the queue for this long; the person keeps waiting. */
export const NOT_NOW_MS = 3 * 24 * 60 * 60 * 1000

export function isJoinDecision(value: unknown): value is JoinDecision {
  return typeof value === 'string' && (JOIN_DECISIONS as readonly string[]).includes(value)
}

export interface JoinRequest {
  /** The invite they joined with: the handle for deciding. */
  id: string
  username: string
  name: string | null
  /** When they joined (ISO). */
  askedAt: string
  invitedBy: { username: string; name: string | null } | null
  /** They joined with `invitedBy`'s group link rather than a one-person invite. */
  viaGroupLink: boolean
  /** Snoozed with "Not now" until then (ISO), or null. */
  snoozedUntil: string | null
}

type Row = {
  id: string
  username: string
  display_name: string | null
  created_at: string | null
  snoozed_until: number | null
  inviter_username: string | null
  inviter_name: string | null
  via_group: number
}

function sqliteTime(value: string | null): string {
  if (!value) return new Date(0).toISOString()
  // CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC.
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? new Date(`${value.replace(' ', 'T')}Z`).toISOString()
    : value
}

/**
 * People waiting to be let in, oldest first. Snoozed ones ("Not now") are
 * left out unless `includeSnoozed`.
 */
export function listJoinRequests(
  options: { includeSnoozed?: boolean } = {},
  now = Date.now(),
): JoinRequest[] {
  const rows = db.all<Row>(sql`
    SELECT ui.provider_id AS id, u.username, u.display_name, u.created_at,
           u.approval_snoozed_until AS snoozed_until,
           m.username AS inviter_username, m.display_name AS inviter_name,
           (i.group_id IS NOT NULL) AS via_group
    FROM users u
    JOIN user_identities ui ON ui.user_id = u.id AND ui.provider = 'invite'
    LEFT JOIN invites i ON i.id = ui.provider_id
    LEFT JOIN users m ON m.id = i.created_by
    WHERE u.approval = 'pending'
      AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = u.id)
      AND (${options.includeSnoozed ? 1 : 0} = 1
           OR u.approval_snoozed_until IS NULL OR u.approval_snoozed_until <= ${now})
    ORDER BY u.created_at, u.username
  `)
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.display_name ?? null,
    askedAt: sqliteTime(r.created_at),
    invitedBy: r.inviter_username
      ? { username: r.inviter_username, name: r.inviter_name ?? null }
      : null,
    viaGroupLink: !!r.via_group,
    snoozedUntil:
      r.snoozed_until && r.snoozed_until > now ? new Date(r.snoozed_until).toISOString() : null,
  }))
}

/** How many people are waiting right now (not snoozed): the badge on Your people. */
export function waitingCount(now = Date.now()): number {
  return listJoinRequests({}, now).length
}

export type DecideResult =
  { ok: true; approval: 'approved' | 'pending' | 'declined' } | { ok: false; reason: 'not_found' }

/**
 * An admin's answer to a waiting join. Approve lets them in; Decline keeps
 * them out (the account stays, signed out, so the waiting page can say so);
 * Not now leaves them waiting and hides the card for a few days. Only a
 * pending account can be decided.
 */
export function decideJoinRequest(
  requestId: string,
  decision: JoinDecision,
  actorUserId: string,
  now = Date.now(),
): DecideResult {
  return runInTransaction((): DecideResult => {
    const target = db
      .select({ userId: users.id, username: users.username })
      .from(userIdentities)
      .innerJoin(users, eq(users.id, userIdentities.userId))
      .where(
        and(
          eq(userIdentities.provider, 'invite'),
          eq(userIdentities.providerId, requestId),
          eq(users.approval, 'pending'),
        ),
      )
      .get()
    if (!target) return { ok: false, reason: 'not_found' }
    if (decision === 'not_now') {
      db.update(users)
        .set({ approvalSnoozedUntil: now + NOT_NOW_MS })
        .where(eq(users.id, target.userId))
        .run()
      return { ok: true, approval: 'pending' }
    }
    const approval = decision === 'approve' ? 'approved' : 'declined'
    db.update(users)
      .set({ approval, approvalSnoozedUntil: null })
      .where(and(eq(users.id, target.userId), eq(users.approval, 'pending')))
      .run()
    writeAudit(actorUserId, decision === 'approve' ? 'approve_join' : 'decline_join', {
      username: target.username,
    })
    return { ok: true, approval }
  })
}

/**
 * For the waiting page: who lets them in (the first admin's name) and who
 * invited them. Names only, never ids.
 */
export function waitingFor(userId: string): { admin: string | null; inviter: string | null } {
  const inviter = db
    .select({ username: users.username, name: users.displayName })
    .from(userIdentities)
    .innerJoin(invites, eq(invites.id, userIdentities.providerId))
    .innerJoin(users, eq(users.id, invites.createdBy))
    .where(and(eq(userIdentities.provider, 'invite'), eq(userIdentities.userId, userId)))
    .get()
  const admin = db
    .select({ username: users.username, name: users.displayName })
    .from(users)
    .where(eq(users.role, 'admin'))
    .orderBy(users.createdAt)
    .limit(1)
    .get()
  const named = (u: { username: string; name: string | null } | undefined) =>
    u ? u.name?.trim() || u.username : null
  return { admin: named(admin), inviter: named(inviter) }
}
