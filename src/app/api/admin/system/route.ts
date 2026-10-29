import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { withAdmin } from '@/lib/admin/guard'
import { writeAudit } from '@/lib/admin/moderation'
import { handleRouteError } from '@/lib/api/response'
import { sendTestEmail } from '@/lib/email/magic-link'
import { failureKind } from '@/lib/ops/service-calls'
import { askJev, jevAvailable } from '@/lib/semantic/jev'
import { ExtraError, isExtraName, setExtra, type ExtraName } from '@/lib/settings/extras'
import { wakeKeep } from '@/lib/keep/worker'
import { enqueueBackfill } from '@/lib/semantic/queue'
import { wakeJobs } from '@/lib/semantic/supervisor'
import { captureException } from '@/lib/sentry'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * POST /api/admin/system (admins), audited without values:
 * - `{ action: 'set', name, value }`: save a setting (`value: null` or '' goes
 *   back to the environment's) → `{ ok: true }`; 409 with the reason when the
 *   value isn't valid. Values are never written to the audit log.
 * - `{ action: 'test', service: 'jev' | 'email' }`: one real call →
 *   `{ ok, ms?, error? }` (email goes to the admin's own address).
 */
/** Start what a change switched on now, instead of on the next check. */
function applyChange(name: ExtraName): void {
  if (name.startsWith('KEEP_')) wakeKeep()
  if (name === 'SEMANTIC_SPEECH' || name === 'SEMANTIC_SCREEN_TEXT' || name === 'INDEXING_LEVEL') {
    // Older posts need the newly switched-on kinds (or a re-read at the new level)
    // too; wait out the worker process's few-second settings cache first.
    setTimeout(() => {
      enqueueBackfill()
        .then(() => wakeJobs())
        .catch((error) => captureException(error, { endpoint: 'admin.system.settings' }))
    }, 6_000).unref?.()
  }
}

export const POST = withAdmin(async (request: NextRequest, actor) => {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown
    name?: unknown
    value?: unknown
    service?: unknown
  } | null
  try {
    if (body?.action === 'set' && isExtraName(body.name)) {
      const value = typeof body.value === 'string' ? body.value : null
      try {
        setExtra(body.name, value)
      } catch (error) {
        if (error instanceof ExtraError)
          return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE })
        throw error
      }
      writeAudit(actor.userId, 'set_setting', { name: body.name, cleared: !value?.trim() })
      applyChange(body.name)
      return NextResponse.json({ ok: true }, { headers: NO_STORE })
    }
    if (body?.action === 'test' && (body.service === 'jev' || body.service === 'email')) {
      writeAudit(actor.userId, 'test_service', { service: body.service })
      const started = Date.now()
      try {
        if (body.service === 'jev') {
          if (!jevAvailable()) throw new Error('No Jev key is set')
          await askJev(
            { message: 'ADHX admin check' },
            {
              ok: {
                type: 'score',
                instructions: 'Is this a short check message?',
                criteria: ['no', 'yes'],
              },
            },
            10_000,
            'admin test',
          )
        } else {
          const [me] = db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, actor.userId))
            .all()
          if (!me?.email) throw new Error('Your account has no email address')
          await sendTestEmail(me.email)
        }
        return NextResponse.json({ ok: true, ms: Date.now() - started }, { headers: NO_STORE })
      } catch (error) {
        const known =
          error instanceof Error &&
          /^(No Jev key is set|No email service is set up|Your account has no email address)$/.test(
            error.message,
          )
        return NextResponse.json(
          { ok: false, error: known ? (error as Error).message : failureKind(error) },
          { headers: NO_STORE },
        )
      }
    }
    return NextResponse.json(
      { error: "action is 'set' with name and value, or 'test' with service jev or email" },
      { status: 400, headers: NO_STORE },
    )
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/system', userId: actor.userId })
  }
})
