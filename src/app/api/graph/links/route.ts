/**
 * POST/DELETE /api/graph/links — create / remove a user-drawn link between two
 * saves. Body: { a: {platform, id}, b: {platform, id} }. Stored canonicalized
 * (endpoints sorted by `platform:id`) so links are undirected + deduped; no
 * self-links.
 */
import { NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { graphLinks } from '@/lib/db/schema'
import { withAuth } from '@/lib/api/with-auth'
import { ok, fail, handleRouteError } from '@/lib/api/response'

interface Endpoint {
  platform: string
  id: string
}

function parseEndpoint(v: unknown): Endpoint | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const platform = typeof o.platform === 'string' ? o.platform : ''
  const id = typeof o.id === 'string' ? o.id : ''
  if (!platform || !id) return null
  return { platform, id }
}

/** Sort the two endpoints so (A,B) and (B,A) collapse to one row. */
function canonical(a: Endpoint, b: Endpoint): [Endpoint, Endpoint] {
  const ka = `${a.platform}:${a.id}`
  const kb = `${b.platform}:${b.id}`
  return ka <= kb ? [a, b] : [b, a]
}

async function readPair(req: NextRequest): Promise<[Endpoint, Endpoint] | { error: string }> {
  const body = (await req.json().catch(() => ({}))) as { a?: unknown; b?: unknown }
  const a = parseEndpoint(body.a)
  const b = parseEndpoint(body.b)
  if (!a || !b) return { error: 'Both endpoints { platform, id } are required' }
  if (a.platform === b.platform && a.id === b.id) return { error: 'Cannot link a save to itself' }
  return canonical(a, b)
}

export const POST = withAuth(async (req: NextRequest, userId) => {
  try {
    const pair = await readPair(req)
    if ('error' in pair) return fail(pair.error, 400)
    const [a, b] = pair
    await db
      .insert(graphLinks)
      .values({
        userId,
        aPlatform: a.platform,
        aId: a.id,
        bPlatform: b.platform,
        bId: b.id,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
    return ok({ success: true })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/graph/links', userId })
  }
})

export const DELETE = withAuth(async (req: NextRequest, userId) => {
  try {
    const pair = await readPair(req)
    if ('error' in pair) return fail(pair.error, 400)
    const [a, b] = pair
    await db
      .delete(graphLinks)
      .where(
        and(
          eq(graphLinks.userId, userId),
          eq(graphLinks.aPlatform, a.platform),
          eq(graphLinks.aId, a.id),
          eq(graphLinks.bPlatform, b.platform),
          eq(graphLinks.bId, b.id),
        ),
      )
    return ok({ success: true })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/graph/links', userId })
  }
})
