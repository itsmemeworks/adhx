import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { retryFailed } from '@/lib/semantic'

// POST /api/understanding/retry — re-queue this user's failed items at the front.
export const POST = withAuth(async (_request, userId) => {
  try {
    const retried = await retryFailed(userId)
    return NextResponse.json({ retried })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/understanding/retry',
      userId,
      message: 'Failed to retry',
    })
  }
})
