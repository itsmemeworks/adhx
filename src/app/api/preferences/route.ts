import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// GET /api/preferences - Get all user preferences
export async function GET() {
  try {
    const prefs = await db.select().from(userPreferences)

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
}

// PATCH /api/preferences - Update user preferences
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const now = new Date().toISOString()

    // Update each provided preference
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue

      // Upsert preference
      const existing = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.key, key))
        .limit(1)

      if (existing.length > 0) {
        await db
          .update(userPreferences)
          .set({ value, updatedAt: now })
          .where(eq(userPreferences.key, key))
      } else {
        await db.insert(userPreferences).values({
          key,
          value,
          updatedAt: now,
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating preferences:', error)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}
