import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncLogs } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { nanoid } from '@/lib/utils'
import { withAuth } from '@/lib/api/with-auth'
import { hasExistingTokens } from '@/lib/auth/oauth'
import { REAUTH_MESSAGE } from '@/lib/sync/messages'
import { getSyncCooldownMs } from '@/lib/sync/config'
import { claimSync, MANUAL_SYNC } from '@/lib/sync/claim'
import { observeSync } from '@/lib/sync/observe'
import { runBookmarkSync } from '@/lib/sync/run'

function terminalSyncErrorResponse(message: string, code: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: error\ndata: ${JSON.stringify({ message, code })}\n\n`),
      )
      controller.close()
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

/**
 * Auth-loss during sync (valid session JWT, but the OAuth tokens are gone —
 * disconnected, fatal refresh cleared them, or X rejected the user token with
 * 401/402/403). This is an expected, user-recoverable state ("reconnect"),
 * NOT a bug, so we surface it to the user but do NOT report it to Sentry
 * as an exception — except 402, which we record as a warning so a developer
 * plan lapse is still visible.
 */

// GET /api/sync - SSE endpoint for sync progress
export const GET = withAuth(async (request, userId) => {
  // Check cooldown between syncs (configurable via SYNC_COOLDOWN_MINUTES env)
  const cooldownMs = getSyncCooldownMs()
  const [lastSync] = await db
    .select()
    .from(syncLogs)
    .where(and(eq(syncLogs.status, 'completed'), eq(syncLogs.userId, userId), MANUAL_SYNC()))
    .orderBy(desc(syncLogs.completedAt))
    .limit(1)

  if (lastSync?.completedAt) {
    const elapsed = Date.now() - new Date(lastSync.completedAt).getTime()
    if (elapsed < cooldownMs) {
      return NextResponse.json(
        {
          error: 'Please wait before syncing again',
          cooldownRemaining: cooldownMs - elapsed,
        },
        { status: 429 },
      )
    }
  }

  // Guard: a valid session JWT doesn't guarantee live OAuth tokens (the token
  // chain can die while the cookie lingers). Send an SSE error event (not a
  // JSON 401) so EventSource delivers the classified message instead of the
  // client showing a generic "Connection lost".
  if (!(await hasExistingTokens(userId))) {
    return terminalSyncErrorResponse(REAUTH_MESSAGE, 'reauth')
  }

  // Claim before returning the streaming response. Reaping a stale claim and
  // inserting this running row happen in one transaction; the DB's partial
  // unique index makes the lock durable across requests and app processes.
  const claim = claimSync(userId, nanoid())
  if (!claim.claimed) {
    return observeSync(userId, claim.syncId, request.signal)
  }
  const { syncId } = claim

  // Disconnect handling: if the client goes away mid-sync (tab closed, nav
  // away, flaky mobile connection), stop paginating/processing and stop
  // enqueuing on a torn-down controller instead of running the full sync to
  // completion against a socket nobody's reading.
  let aborted = false
  const onAbort = () => {
    aborted = true
  }
  request.signal.addEventListener('abort', onAbort)

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: object) => {
        if (aborted) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Controller already closed/errored (client disconnected) — ignore.
        }
      }

      try {
        await runBookmarkSync(userId, syncId, { mode: 'full', send, isAborted: () => aborted })
      } finally {
        request.signal.removeEventListener('abort', onAbort)
        try {
          controller.close()
        } catch {
          // Already closed/errored via cancel() on client disconnect — ignore.
        }
      }
    },
    cancel() {
      // Fires when the consumer (client) cancels the stream — the standard
      // signal for "browser disconnected" on a Response body stream.
      onAbort()
      request.signal.removeEventListener('abort', onAbort)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
