import { NextResponse } from 'next/server'
import { getUserIdForUsername, resolveUsernameAlias } from '@/lib/users/lookup'
import { withAuth } from '@/lib/api/with-auth'
import { cloneTagToUser } from '@/lib/tags/clone'

/**
 * POST /api/share/tag/by-name/[username]/[tag]/clone
 * Clone a shared tag playlist to the current user's account.
 */
export const POST = withAuth(
  async (
    _request,
    currentUserId,
    { params }: { params: Promise<{ username: string; tag: string }> },
  ) => {
    try {
      const { username: usernameParam, tag: tagName } = await params

      let resolvedOwnerId = await getUserIdForUsername(usernameParam)
      if (!resolvedOwnerId) {
        const alias = await resolveUsernameAlias(usernameParam)
        if (alias) resolvedOwnerId = alias.userId
      }

      if (!resolvedOwnerId) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      const result = await cloneTagToUser({
        sourceUserId: resolvedOwnerId,
        tagName,
        currentUserId,
      })

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      if (result.total === 0) {
        return NextResponse.json({
          success: true,
          clonedCount: 0,
          message: 'No bookmarks to clone',
        })
      }

      return NextResponse.json({
        success: true,
        clonedCount: result.clonedCount,
        taggedCount: result.taggedCount,
      })
    } catch (error) {
      console.error('Error cloning tag:', error)
      return NextResponse.json({ error: 'Failed to clone tag' }, { status: 500 })
    }
  },
)
