import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'

/**
 * Higher-order wrapper that removes repeated auth boilerplate from API routes.
 *
 * It resolves the current user via `getCurrentUserId()`. When there's no valid
 * session it short-circuits with the standard `401 { error: 'Unauthorized' }`
 * response; otherwise it invokes `handler` with the resolved `userId`.
 *
 * The route-handler context (`ctx`) is passed through untouched, so dynamic
 * routes keep access to their params — e.g. `await ctx.params`.
 *
 * @example Static route (no params)
 * export const GET = withAuth(async (req, userId) => {
 *   // ...query with userId filter
 *   return NextResponse.json({ data })
 * })
 *
 * @example Dynamic route (params preserved via ctx)
 * export const GET = withAuth(
 *   async (req, userId, ctx: { params: Promise<{ id: string }> }) => {
 *     const { id } = await ctx.params
 *     // ...
 *   }
 * )
 */
export function withAuth<C = unknown>(
  handler: (req: NextRequest, userId: string, ctx: C) => Promise<Response> | Response,
): (req?: NextRequest, ctx?: C) => Promise<Response> {
  return async (req?: NextRequest, ctx?: C): Promise<Response> => {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return handler(req as NextRequest, userId, ctx as C)
  }
}
