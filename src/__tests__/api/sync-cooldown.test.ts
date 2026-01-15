import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/sync/cooldown
 *
 * Tests sync cooldown enforcement (15-minute rate limit).
 */

let testInstance: TestDbInstance
let mockUserId: string | null = 'user-123'

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

const COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes

describe('API: /api/sync/cooldown', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-123'
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      expect(response.status).toBe(401)
    })
  })

  describe('No previous sync', () => {
    it('allows sync when no previous sync exists', async () => {
      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.canSync).toBe(true)
      expect(data.cooldownRemaining).toBe(0)
      expect(data.lastSyncAt).toBeNull()
    })
  })

  describe('Within cooldown period', () => {
    it('denies sync when last sync was within 15 minutes', async () => {
      // Insert a sync that completed 5 minutes ago
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      await testInstance.db.insert(schema.syncLogs).values({
        id: 'sync-1',
        userId: 'user-123',
        startedAt: fiveMinutesAgo,
        completedAt: fiveMinutesAgo,
        status: 'completed',
        totalFetched: 10,
        newBookmarks: 5,
      })

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.canSync).toBe(false)
      expect(data.cooldownRemaining).toBeGreaterThan(0)
      expect(data.cooldownRemaining).toBeLessThanOrEqual(COOLDOWN_MS)
      expect(data.lastSyncAt).toBe(fiveMinutesAgo)
    })

    it('calculates remaining cooldown correctly', async () => {
      // Insert a sync that completed 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      await testInstance.db.insert(schema.syncLogs).values({
        id: 'sync-1',
        userId: 'user-123',
        startedAt: tenMinutesAgo,
        completedAt: tenMinutesAgo,
        status: 'completed',
      })

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      const data = await response.json()
      // Should have ~5 minutes remaining (with some tolerance for test execution)
      expect(data.cooldownRemaining).toBeGreaterThan(4 * 60 * 1000)
      expect(data.cooldownRemaining).toBeLessThan(6 * 60 * 1000)
    })
  })

  describe('After cooldown period', () => {
    it('allows sync when last sync was more than 15 minutes ago', async () => {
      // Insert a sync that completed 20 minutes ago
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
      await testInstance.db.insert(schema.syncLogs).values({
        id: 'sync-1',
        userId: 'user-123',
        startedAt: twentyMinutesAgo,
        completedAt: twentyMinutesAgo,
        status: 'completed',
      })

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.canSync).toBe(true)
      expect(data.cooldownRemaining).toBe(0)
    })

    it('allows sync exactly at 15 minutes', async () => {
      // Insert a sync that completed exactly 15 minutes ago
      const fifteenMinutesAgo = new Date(Date.now() - COOLDOWN_MS - 1000).toISOString()
      await testInstance.db.insert(schema.syncLogs).values({
        id: 'sync-1',
        userId: 'user-123',
        startedAt: fifteenMinutesAgo,
        completedAt: fifteenMinutesAgo,
        status: 'completed',
      })

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      const data = await response.json()
      expect(data.canSync).toBe(true)
    })
  })

  describe('Multi-user isolation', () => {
    it('checks cooldown for current user only', async () => {
      // Insert a recent sync for a DIFFERENT user
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      await testInstance.db.insert(schema.syncLogs).values({
        id: 'sync-other-user',
        userId: 'other-user',
        startedAt: fiveMinutesAgo,
        completedAt: fiveMinutesAgo,
        status: 'completed',
      })

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      const data = await response.json()
      // Current user should be able to sync (no sync history for them)
      expect(data.canSync).toBe(true)
    })
  })

  describe('Sync status filtering', () => {
    it('ignores non-completed syncs', async () => {
      // Insert a recent sync that is still in progress
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      await testInstance.db.insert(schema.syncLogs).values({
        id: 'sync-1',
        userId: 'user-123',
        startedAt: fiveMinutesAgo,
        completedAt: null, // Not completed
        status: 'in_progress',
      })

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      const data = await response.json()
      // Should allow sync since no completed sync exists
      expect(data.canSync).toBe(true)
    })

    it('ignores failed syncs', async () => {
      // Insert a recent failed sync
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      await testInstance.db.insert(schema.syncLogs).values({
        id: 'sync-1',
        userId: 'user-123',
        startedAt: fiveMinutesAgo,
        completedAt: fiveMinutesAgo,
        status: 'failed',
        errorMessage: 'API error',
      })

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      const data = await response.json()
      // Should allow sync since failed syncs don't count
      expect(data.canSync).toBe(true)
    })

    it('uses most recent completed sync', async () => {
      // Insert multiple syncs, only check the most recent completed one
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

      await testInstance.db.insert(schema.syncLogs).values([
        {
          id: 'sync-old',
          userId: 'user-123',
          startedAt: oneHourAgo,
          completedAt: oneHourAgo,
          status: 'completed',
        },
        {
          id: 'sync-recent',
          userId: 'user-123',
          startedAt: fiveMinutesAgo,
          completedAt: fiveMinutesAgo,
          status: 'completed',
        },
      ])

      const { GET } = await import('@/app/api/sync/cooldown/route')
      const response = await GET()

      const data = await response.json()
      // Should use the most recent sync (5 minutes ago) for cooldown
      expect(data.canSync).toBe(false)
      expect(data.lastSyncAt).toBe(fiveMinutesAgo)
    })
  })
})
