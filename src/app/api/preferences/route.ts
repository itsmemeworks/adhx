import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userPreferences } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { metrics } from '@/lib/sentry'
import { withAuth } from '@/lib/api/with-auth'

// GET /api/preferences - Get all user preferences
export const GET = withAuth(async (_req, userId) => {
  try {
    const prefs = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId))

    // Convert to object
    const preferences: Record<string, string> = {}
    for (const pref of prefs) {
      preferences[pref.key] = pref.value || ''
    }

    return NextResponse.json(preferences)
  } catch (error) {
    console.error('Error fetching preferences:', error)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }
})

// PATCH /api/preferences - Update user preferences
export const PATCH = withAuth(async (request: NextRequest, userId) => {
  try {
    const body = await request.json()
    const now = new Date().toISOString()

    // Update each provided preference (using composite key: userId + key)
    const updatedKeys: string[] = []
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue

      // Upsert preference
      const existing = await db
        .select()
        .from(userPreferences)
        .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
        .limit(1)

      if (existing.length > 0) {
        await db
          .update(userPreferences)
          .set({ value, updatedAt: now })
          .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
      } else {
        await db.insert(userPreferences).values({
          userId,
          key,
          value,
          updatedAt: now,
        })
      }

      updatedKeys.push(key)
    }

    if (updatedKeys.length > 0) {
      metrics.settingsChanged(updatedKeys.join(','), updatedKeys.length.toString())
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating preferences:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
})
