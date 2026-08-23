import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { setUserBanned } from '@/lib/admin/moderation'
import { inspectUser } from '@/lib/admin/query'
import { handleRouteError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAdmin(async (request: NextRequest, actor) => {
  try {
    const username = (request.nextUrl.searchParams.get('username') || '').trim()
    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 })
    }
    const user = await inspectUser(username)
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json(user, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/users', userId: actor.userId })
  }
})

export const POST = withAdmin(async (request: NextRequest, actor) => {
  try {
    let body: { username?: unknown; banned?: unknown; reason?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const banned = typeof body.banned === 'boolean' ? body.banned : true
    const reason = typeof body.reason === 'string' ? body.reason : null
    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 })
    }

    const result = await setUserBanned({
      username,
      banned,
      actorUserId: actor.userId,
      actorUsername: actor.username,
      reason,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/users', userId: actor.userId })
  }
})
