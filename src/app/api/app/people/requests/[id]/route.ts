import { NextResponse } from 'next/server'
import { phoneCaller, badKey } from '@/lib/api/phone-auth'
import { answerJoinRequest } from '@/lib/people/view'

/** POST /api/app/people/requests/[id] { decision } — the web route, for the phone (admins). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await phoneCaller(request)
  if (!caller) return badKey()
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  const result = await answerJoinRequest(caller.userId, id, body)
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
