import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userPreferences, readStatus } from '@/lib/db/schema'
import { eq, and, count, gte } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { captureException } from '@/lib/sentry'
import {
  type StreakState,
  effectiveCurrent,
  isValidDay,
  recordDay,
} from '@/lib/triage/streak'

/**
 * Daily triage streak, persisted in the existing user_preferences KV table
 * (key `triage_streak`) — no schema migration needed.
 *
 * GET  /api/triage/streak?today=YYYY-MM-DD  → effective streak (no mutation)
 * POST /api/triage/streak { today }         → record a triage day, returns new
 *                                              streak + how much it grew
 */

const KEY = 'triage_streak'

async function readState(userId: string): Promise<StreakState | null> {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, KEY)))
    .limit(1)
  if (!row?.value) return null
  try {
    const parsed = JSON.parse(row.value)
    if (typeof parsed?.current === 'number' && isValidDay(parsed?.lastActiveDate)) {
      return {
        current: parsed.current,
        longest: typeof parsed.longest === 'number' ? parsed.longest : parsed.current,
        lastActiveDate: parsed.lastActiveDate,
      }
    }
  } catch {
    /* corrupt value — treat as no streak */
  }
  return null
}

async function writeState(userId: string, state: StreakState): Promise<void> {
  const now = new Date().toISOString()
  const value = JSON.stringify(state)
  const existing = await db
    .select()
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, KEY)))
    .limit(1)
  if (existing.length > 0) {
    await db
      .update(userPreferences)
      .set({ value, updatedAt: now })
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, KEY)))
  } else {
    await db.insert(userPreferences).values({ userId, key: KEY, value, updatedAt: now })
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = request.nextUrl.searchParams.get('today')
    const state = await readState(userId)
    const current = isValidDay(today) ? effectiveCurrent(state, today) : state?.current ?? 0

    // "Triaged" counts — read events are the triage Done signal (no migration).
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const [totalRow] = await db
      .select({ c: count() })
      .from(readStatus)
      .where(eq(readStatus.userId, userId))
    const [weekRow] = await db
      .select({ c: count() })
      .from(readStatus)
      .where(and(eq(readStatus.userId, userId), gte(readStatus.readAt, weekAgo)))

    return NextResponse.json({
      current,
      longest: state?.longest ?? 0,
      lastActiveDate: state?.lastActiveDate ?? null,
      triagedTotal: totalRow?.c ?? 0,
      triagedThisWeek: weekRow?.c ?? 0,
    })
  } catch (error) {
    captureException(error, { endpoint: '/api/triage/streak', method: 'GET' })
    return NextResponse.json({ error: 'Failed to read streak' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const today = body?.today
    if (!isValidDay(today)) {
      return NextResponse.json({ error: 'today (YYYY-MM-DD) is required' }, { status: 400 })
    }

    const prev = await readState(userId)
    const prevEffective = effectiveCurrent(prev, today)
    const next = recordDay(prev, today)
    await writeState(userId, next)

    return NextResponse.json({
      current: next.current,
      longest: next.longest,
      lastActiveDate: next.lastActiveDate,
      // How much it grew this call (0 if already counted today) — drives the
      // "🔥 streak extended!" celebration on the client.
      grew: Math.max(0, next.current - prevEffective),
    })
  } catch (error) {
    captureException(error, { endpoint: '/api/triage/streak', method: 'POST' })
    return NextResponse.json({ error: 'Failed to record streak' }, { status: 500 })
  }
}
