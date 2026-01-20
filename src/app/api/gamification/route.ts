import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'
import { getGamificationProfile } from '@/lib/gamification'

/**
 * GET /api/gamification
 *
 * Returns the user's complete gamification profile including:
 * - Level and XP progress
 * - Current and longest streaks
 * - Lifetime statistics
 * - All achievements with unlock status
 */
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const profile = await getGamificationProfile(userId)
    return NextResponse.json(profile)
  } catch (error) {
    console.error('Failed to fetch gamification profile:', error)
    return NextResponse.json({ error: 'Failed to fetch gamification data' }, { status: 500 })
  }
}
