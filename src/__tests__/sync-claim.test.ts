import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './api/setup'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

describe('claimSync', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    testInstance.sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS sync_logs_one_running_per_user_idx
      ON sync_logs(user_id)
      WHERE status = 'running'
    `)
  })

  afterEach(() => {
    testInstance.close()
  })

  it('claims a running slot before streaming starts', async () => {
    const { claimSync } = await import('@/lib/sync/claim')
    const now = new Date('2026-08-26T12:00:00.000Z')

    expect(claimSync('user-1', 'sync-1', now)).toEqual({
      claimed: true,
      syncId: 'sync-1',
      startedAt: now.toISOString(),
    })

    const [row] = await testInstance.db
      .select()
      .from(schema.syncLogs)
      .where(eq(schema.syncLogs.id, 'sync-1'))
    expect(row).toMatchObject({
      userId: 'user-1',
      status: 'running',
      heartbeatAt: now.toISOString(),
    })
  })

  it('rejects a second fresh claim for the same user', async () => {
    const { claimSync } = await import('@/lib/sync/claim')
    const now = new Date('2026-08-26T12:00:00.000Z')
    claimSync('user-1', 'sync-1', now)

    expect(claimSync('user-1', 'sync-2', new Date(now.getTime() + 1_000))).toEqual({
      claimed: false,
      syncId: 'sync-1',
      startedAt: now.toISOString(),
    })

    const running = await testInstance.db
      .select()
      .from(schema.syncLogs)
      .where(and(eq(schema.syncLogs.userId, 'user-1'), eq(schema.syncLogs.status, 'running')))
    expect(running).toHaveLength(1)
  })

  it('reaps a stale claim and atomically replaces it', async () => {
    const { claimSync, STALE_RUNNING_SYNC_MESSAGE, STALE_RUNNING_SYNC_MS } =
      await import('@/lib/sync/claim')
    const now = new Date('2026-08-26T12:00:00.000Z')
    const staleStartedAt = new Date(now.getTime() - STALE_RUNNING_SYNC_MS - 1).toISOString()
    await testInstance.db.insert(schema.syncLogs).values({
      id: 'stale-sync',
      userId: 'user-1',
      startedAt: staleStartedAt,
      status: 'running',
    })

    expect(claimSync('user-1', 'replacement-sync', now).claimed).toBe(true)

    const rows = await testInstance.db
      .select()
      .from(schema.syncLogs)
      .where(eq(schema.syncLogs.userId, 'user-1'))
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'stale-sync',
          status: 'failed',
          completedAt: now.toISOString(),
          errorMessage: STALE_RUNNING_SYNC_MESSAGE,
        }),
        expect.objectContaining({ id: 'replacement-sync', status: 'running' }),
      ]),
    )
  })

  it('does not reap an old sync with an active heartbeat', async () => {
    const { claimSync, STALE_RUNNING_SYNC_MS } = await import('@/lib/sync/claim')
    const now = new Date('2026-08-26T12:00:00.000Z')
    const oldStart = new Date(now.getTime() - STALE_RUNNING_SYNC_MS * 2).toISOString()
    const activeHeartbeat = new Date(now.getTime() - 1_000).toISOString()
    await testInstance.db.insert(schema.syncLogs).values({
      id: 'long-sync',
      userId: 'user-1',
      startedAt: oldStart,
      heartbeatAt: activeHeartbeat,
      status: 'running',
    })

    expect(claimSync('user-1', 'replacement-sync', now)).toEqual({
      claimed: false,
      syncId: 'long-sync',
      startedAt: oldStart,
    })
  })

  it('reaps a sync whose heartbeat is stale', async () => {
    const { claimSync, STALE_RUNNING_SYNC_MS } = await import('@/lib/sync/claim')
    const now = new Date('2026-08-26T12:00:00.000Z')
    await testInstance.db.insert(schema.syncLogs).values({
      id: 'stale-heartbeat-sync',
      userId: 'user-1',
      startedAt: new Date(now.getTime() - STALE_RUNNING_SYNC_MS * 2).toISOString(),
      heartbeatAt: new Date(now.getTime() - STALE_RUNNING_SYNC_MS - 1).toISOString(),
      status: 'running',
    })

    expect(claimSync('user-1', 'replacement-sync', now).claimed).toBe(true)
    const [stale] = await testInstance.db
      .select()
      .from(schema.syncLogs)
      .where(eq(schema.syncLogs.id, 'stale-heartbeat-sync'))
    expect(stale.status).toBe('failed')
  })

  it('renews and finishes only while the caller owns the running lease', async () => {
    const { claimSync, finishOwnedSync, renewSyncLease } = await import('@/lib/sync/claim')
    const now = new Date('2026-08-26T12:00:00.000Z')
    claimSync('user-1', 'sync-1', now)

    const heartbeat = new Date(now.getTime() + 10_000)
    expect(renewSyncLease('user-1', 'sync-1', heartbeat)).toBe(true)

    await testInstance.db
      .update(schema.syncLogs)
      .set({ status: 'failed', errorMessage: 'Reaped by replacement' })
      .where(eq(schema.syncLogs.id, 'sync-1'))

    expect(
      finishOwnedSync('user-1', 'sync-1', {
        status: 'completed',
        completedAt: new Date(now.getTime() + 20_000).toISOString(),
      }),
    ).toBe(false)

    const [row] = await testInstance.db
      .select()
      .from(schema.syncLogs)
      .where(eq(schema.syncLogs.id, 'sync-1'))
    expect(row).toMatchObject({
      status: 'failed',
      errorMessage: 'Reaped by replacement',
      heartbeatAt: heartbeat.toISOString(),
      completedAt: null,
    })
  })

  it('allows different users to claim concurrently', async () => {
    const { claimSync } = await import('@/lib/sync/claim')
    const now = new Date('2026-08-26T12:00:00.000Z')

    expect(claimSync('user-1', 'sync-1', now).claimed).toBe(true)
    expect(claimSync('user-2', 'sync-2', now).claimed).toBe(true)
  })
})
