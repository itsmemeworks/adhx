/**
 * PATCH /api/graph/items/[id]?platform= — upsert a save's graph annotations
 * (display title override + private note). read/tags live in their own
 * endpoints (read_status / bookmark_tags) so they also reflect in the feed.
 * Empty string clears a field (title reverts to the default label).
 */
import { NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { graphItemMeta } from '@/lib/db/schema'
import { withAuth } from '@/lib/api/with-auth'
import { ok, fail, handleRouteError } from '@/lib/api/response'

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

export const PATCH = withAuth(
  async (req: NextRequest, userId, ctx: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await ctx.params
      const platform = req.nextUrl.searchParams.get('platform') || 'twitter'
      const body = (await req.json().catch(() => ({}))) as { title?: unknown; note?: unknown }

      if (!('title' in body) && !('note' in body)) {
        return fail('Nothing to update', 400)
      }

      const patch: { title?: string | null; note?: string | null } = {}
      if ('title' in body) patch.title = clean(body.title)
      if ('note' in body) patch.note = clean(body.note)
      const now = new Date().toISOString()

      await db
        .insert(graphItemMeta)
        .values({ userId, platform, bookmarkId: id, ...patch, updatedAt: now })
        .onConflictDoUpdate({
          target: [graphItemMeta.userId, graphItemMeta.platform, graphItemMeta.bookmarkId],
          set: { ...patch, updatedAt: now },
        })

      // tidy: if both cleared, drop the row entirely
      const [rowState] = await db
        .select()
        .from(graphItemMeta)
        .where(
          and(
            eq(graphItemMeta.userId, userId),
            eq(graphItemMeta.platform, platform),
            eq(graphItemMeta.bookmarkId, id),
          ),
        )
      if (rowState && rowState.title == null && rowState.note == null) {
        await db
          .delete(graphItemMeta)
          .where(
            and(
              eq(graphItemMeta.userId, userId),
              eq(graphItemMeta.platform, platform),
              eq(graphItemMeta.bookmarkId, id),
            ),
          )
      }

      return ok({ success: true })
    } catch (error) {
      return handleRouteError(error, { endpoint: '/api/graph/items/[id]', userId })
    }
  },
)
