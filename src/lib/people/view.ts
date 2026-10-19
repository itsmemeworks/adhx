import { isAdminUserId } from '@/lib/admin/guard'
import { inviteMode, mayCreateInvites, type InviteMode } from '@/lib/auth/invites'
import {
  decideJoinRequest,
  isJoinDecision,
  listJoinRequests,
  type JoinRequest,
} from '@/lib/auth/approval'
import { listPeople, type Person } from './directory'

/**
 * What Settings → Your people (web) and the phone's people screen show. Join
 * requests and banned members are for admins only.
 */
export interface PeopleView {
  members: Person[]
  isAdmin: boolean
  canInvite: boolean
  inviteMode: InviteMode
  /** Admins only: people waiting to be let in (snoozed ones left out). */
  requests?: JoinRequest[]
}

export async function peopleView(userId: string): Promise<PeopleView> {
  const isAdmin = await isAdminUserId(userId)
  return {
    members: listPeople(userId, { includeBanned: isAdmin }),
    isAdmin,
    canInvite: mayCreateInvites(userId),
    inviteMode: inviteMode(),
    ...(isAdmin ? { requests: listJoinRequests() } : {}),
  }
}

/** An admin's answer to a join request: `{ decision: 'approve' | 'not_now' | 'decline' }`. */
export async function answerJoinRequest(
  userId: string,
  requestId: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!(await isAdminUserId(userId))) {
    return { status: 403, body: { error: 'Only the admin can let people in.', code: 'forbidden' } }
  }
  const decision = (body as { decision?: unknown } | null)?.decision
  if (!isJoinDecision(decision)) {
    return {
      status: 400,
      body: { error: 'Say approve, not_now or decline.', code: 'bad_decision' },
    }
  }
  const result = decideJoinRequest(requestId, decision, userId)
  if (!result.ok) {
    return {
      status: 404,
      body: { error: 'Nobody is waiting with that invite.', code: 'not_found' },
    }
  }
  return { status: 200, body: { approval: result.approval } }
}
