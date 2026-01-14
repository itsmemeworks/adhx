import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'

/**
 * API Route Tests: /api/preferences
 *
 * Tests GET (retrieve all preferences) and PATCH (update preferences).
 * Verifies multi-user isolation for user preferences.
 */

const USER_A = 'user-a-123'
const USER_B = 'user-b-456'

let mockUserId: string | null = USER_A
let testDb: ReturnType<typeof drizzle<typeof schema>>
let sqlite: Database.Database

vi.mock('@/lib/db', () => ({
  get db() {
    return testDb
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

function createTestDatabase() {
  sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE user_preferences (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at TEXT,
      PRIMARY KEY (user_id, key)
    );
  `)
  testDb = drizzle(sqlite, { schema })
}

function createRequest(method: string, body?: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/preferences', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('API: /api/preferences', () => {
  beforeEach(() => {
    createTestDatabase()
    mockUserId = USER_A
    vi.clearAllMocks()
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('GET /api/preferences', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { GET } = await import('@/app/api/preferences/route')
      const response = await GET()

      expect(response.status).toBe(401)
    })

    it('returns empty object when no preferences', async () => {
      const { GET } = await import('@/app/api/preferences/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({})
    })

    it('returns all user preferences as object', async () => {
      await testDb.insert(schema.userPreferences).values([
        { userId: USER_A, key: 'theme', value: 'dark' },
        { userId: USER_A, key: 'font', value: 'inter' },
        { userId: USER_A, key: 'bionicReading', value: 'true' },
      ])

      const { GET } = await import('@/app/api/preferences/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        theme: 'dark',
        font: 'inter',
        bionicReading: 'true',
      })
    })

    it('isolates preferences between users', async () => {
      // User A preferences
      await testDb.insert(schema.userPreferences).values([
        { userId: USER_A, key: 'theme', value: 'dark' },
      ])

      // User B preferences
      await testDb.insert(schema.userPreferences).values([
        { userId: USER_B, key: 'theme', value: 'light' },
        { userId: USER_B, key: 'font', value: 'lexend' },
      ])

      const { GET } = await import('@/app/api/preferences/route')

      // User A should only see their preferences
      mockUserId = USER_A
      const responseA = await GET()
      const dataA = await responseA.json()
      expect(dataA).toEqual({ theme: 'dark' })

      // User B should only see their preferences
      mockUserId = USER_B
      const responseB = await GET()
      const dataB = await responseB.json()
      expect(dataB).toEqual({ theme: 'light', font: 'lexend' })
    })
  })

  describe('PATCH /api/preferences', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { PATCH } = await import('@/app/api/preferences/route')
      const response = await PATCH(createRequest('PATCH', { theme: 'dark' }))

      expect(response.status).toBe(401)
    })

    it('creates new preferences', async () => {
      const { PATCH } = await import('@/app/api/preferences/route')
      const response = await PATCH(createRequest('PATCH', {
        theme: 'dark',
        font: 'inter',
      }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)

      // Verify in database
      const prefs = await testDb.select().from(schema.userPreferences).where(
        eq(schema.userPreferences.userId, USER_A)
      )
      expect(prefs).toHaveLength(2)
    })

    it('updates existing preferences', async () => {
      // Create initial preferences
      await testDb.insert(schema.userPreferences).values([
        { userId: USER_A, key: 'theme', value: 'light' },
        { userId: USER_A, key: 'font', value: 'system' },
      ])

      const { PATCH } = await import('@/app/api/preferences/route')
      const response = await PATCH(createRequest('PATCH', {
        theme: 'dark',
        font: 'inter',
      }))

      expect(response.status).toBe(200)

      // Verify updated
      const [theme] = await testDb.select().from(schema.userPreferences).where(
        and(eq(schema.userPreferences.userId, USER_A), eq(schema.userPreferences.key, 'theme'))
      )
      const [font] = await testDb.select().from(schema.userPreferences).where(
        and(eq(schema.userPreferences.userId, USER_A), eq(schema.userPreferences.key, 'font'))
      )

      expect(theme.value).toBe('dark')
      expect(font.value).toBe('inter')
    })

    it('can mix creating and updating preferences', async () => {
      // Create one existing preference
      await testDb.insert(schema.userPreferences).values([
        { userId: USER_A, key: 'theme', value: 'light' },
      ])

      const { PATCH } = await import('@/app/api/preferences/route')
      await PATCH(createRequest('PATCH', {
        theme: 'dark', // update
        font: 'inter', // create
        bionicReading: 'true', // create
      }))

      const prefs = await testDb.select().from(schema.userPreferences).where(
        eq(schema.userPreferences.userId, USER_A)
      )

      expect(prefs).toHaveLength(3)
      expect(prefs.find((p) => p.key === 'theme')?.value).toBe('dark')
      expect(prefs.find((p) => p.key === 'font')?.value).toBe('inter')
      expect(prefs.find((p) => p.key === 'bionicReading')?.value).toBe('true')
    })

    it('ignores non-string values', async () => {
      const { PATCH } = await import('@/app/api/preferences/route')
      await PATCH(createRequest('PATCH', {
        theme: 'dark',
        invalid: 123, // should be ignored
        alsoInvalid: { nested: 'object' }, // should be ignored
      }))

      const prefs = await testDb.select().from(schema.userPreferences).where(
        eq(schema.userPreferences.userId, USER_A)
      )

      expect(prefs).toHaveLength(1)
      expect(prefs[0].key).toBe('theme')
    })

    it('does not affect another user\'s preferences', async () => {
      // User B has preferences
      await testDb.insert(schema.userPreferences).values([
        { userId: USER_B, key: 'theme', value: 'light' },
      ])

      // User A updates preferences
      const { PATCH } = await import('@/app/api/preferences/route')
      await PATCH(createRequest('PATCH', { theme: 'dark' }))

      // User B's preferences should be unchanged
      const [userBPref] = await testDb.select().from(schema.userPreferences).where(
        and(eq(schema.userPreferences.userId, USER_B), eq(schema.userPreferences.key, 'theme'))
      )
      expect(userBPref.value).toBe('light')
    })
  })
})
