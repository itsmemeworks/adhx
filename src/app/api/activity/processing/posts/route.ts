import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { freeDiskBytes } from '@/lib/keep/worker'
import {
  diskIsFull,
  keepStatusFor,
  MAX_STATUS_POSTS,
  parseStatusPosts,
  peopleFaces,
} from '@/lib/processing/keep-status'

export const dynamic = 'force-dynamic'

/**
 * GET /api/activity/processing/posts?posts=platform:id,… (at most 20) →
 * `{ posts: [{ platform, id, state, step, percent, keptAt }], people }`:
 * is each post kept yet, for the theater's "Getting it ready" stage.
 * `state` is `waiting | keeping | converting` (on its way: `step` 2 or 3 of
 * Got the link · Keeping a copy · Making it play everywhere, `percent` while
 * downloading) or `kept | none` (it plays now; `keptAt` when kept). Posts
 * the viewer may not see are left out. `people` is up to 4 of the viewer's
 * people (`{ username, name, avatarUrl }`), for "Shared with your people".
 */
export const GET = withAuth(async (request, userId) => {
  const posts = parseStatusPosts(new URL(request.url).searchParams.get('posts'))
  if (!posts) {
    return NextResponse.json(
      { error: `At most ${MAX_STATUS_POSTS} posts at a time.` },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const diskFull = diskIsFull(await freeDiskBytes())
  return NextResponse.json(
    { posts: keepStatusFor(userId, posts, { diskFull }), people: peopleFaces(userId) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
})
