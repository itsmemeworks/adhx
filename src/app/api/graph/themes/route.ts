/**
 * PATCH /api/graph/themes — upsert a theme's display override (rename + icon).
 * Body: { themeId, name?, icon? }. Empty string clears (reverts to the derived
 * label / no icon). themeId is the stable slug (`tag:…` / `kw:…`); sent in the
 * body rather than the path because it contains a colon.
 */
import { NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { graphThemeMeta } from '@/lib/db/schema'
import { withAuth } from '@/lib/api/with-auth'
import { ok, fail, handleRouteError } from '@/lib/api/response'

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

async function upsertTheme(req: NextRequest, userId: string) {
  const body = (await req.json().catch(() => ({}))) as {
    themeId?: unknown
    name?: unknown
    icon?: unknown
  }
  const themeId = typeof body.themeId === 'string' ? body.themeId.trim() : ''
  if (!themeId) return fail('themeId is required', 400)
  if (!('name' in body) && !('icon' in body)) return fail('Nothing to update', 400)

  const patch: { name?: string | null; icon?: string | null } = {}
  if ('name' in body) patch.name = clean(body.name)
  if ('icon' in body) patch.icon = clean(body.icon)
  const now = new Date().toISOString()

  await db
    .insert(graphThemeMeta)
    .values({ userId, themeId, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: [graphThemeMeta.userId, graphThemeMeta.themeId],
      set: { ...patch, updatedAt: now },
    })

  // tidy: drop the row when nothing remains overridden
  const [rowState] = await db
    .select()
    .from(graphThemeMeta)
    .where(and(eq(graphThemeMeta.userId, userId), eq(graphThemeMeta.themeId, themeId)))
  if (rowState && rowState.name == null && rowState.icon == null) {
    await db
      .delete(graphThemeMeta)
      .where(and(eq(graphThemeMeta.userId, userId), eq(graphThemeMeta.themeId, themeId)))
  }

  return ok({ success: true })
}

export const PATCH = withAuth(async (req: NextRequest, userId) => {
  try {
    return await upsertTheme(req, userId)
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/graph/themes', userId })
  }
})

export const POST = PATCH
