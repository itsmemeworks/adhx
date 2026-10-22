import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { scheduleStatistics } from '@/lib/db/statistics'

const sixHours = 6 * 60 * 60_000
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('long-lived database statistics', () => {
  it('defers and coalesces maintenance while restoring the normal writer timeout', async () => {
    const db = new Database(':memory:')
    db.pragma('busy_timeout=4321')
    const pragma = vi.spyOn(db, 'pragma')
    try {
      scheduleStatistics(db, 0)
      scheduleStatistics(db, sixHours - 1)
      expect(pragma).not.toHaveBeenCalled()
      scheduleStatistics(db, sixHours)
      scheduleStatistics(db, sixHours + 1)
      expect(pragma).not.toHaveBeenCalled()
      await flush()
      expect(pragma.mock.calls.filter(([q]) => q === 'optimize')).toHaveLength(1)
      expect(db.pragma('busy_timeout', { simple: true })).toBe(4321)
    } finally {
      db.close()
    }
  })
  it('restores the timeout after failed optional optimisation', async () => {
    const db = new Database(':memory:')
    db.pragma('busy_timeout=2345')
    const original = db.pragma.bind(db)
    vi.spyOn(db, 'pragma').mockImplementation((source, options) => {
      if (source === 'optimize') throw new Error('database is locked')
      return original(source, options)
    })
    try {
      scheduleStatistics(db, 0)
      scheduleStatistics(db, sixHours)
      await flush()
      expect(db.pragma('busy_timeout', { simple: true })).toBe(2345)
    } finally {
      db.close()
    }
  })
  it('ignores a database closed after maintenance was queued', async () => {
    const db = new Database(':memory:')
    const pragma = vi.spyOn(db, 'pragma')
    scheduleStatistics(db, 0)
    scheduleStatistics(db, sixHours)
    db.close()
    await flush()
    expect(pragma).not.toHaveBeenCalled()
  })
})
