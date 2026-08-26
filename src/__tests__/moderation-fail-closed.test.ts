import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

import {
  ModerationStoreUnavailableError,
  isPostModerated,
  isUserBanned,
  listBannedUserIds,
  listModeratedPostKeys,
  readBannedUserIds,
  readModeratedPostKeys,
  readPostModeration,
  readUserBan,
} from '@/lib/admin/moderation'

describe('moderation reads fail closed', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('distinguishes a confirmed visible post from an unreadable moderation store', () => {
    expect(readPostModeration('twitter', 'visible')).toEqual({ ok: true, value: false })

    testInstance.sqlite.exec('DROP TABLE moderated_posts')
    const result = readPostModeration('twitter', 'uncertain')

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected unavailable result')
    expect(result.error).toBeInstanceOf(ModerationStoreUnavailableError)
    expect(() => isPostModerated('twitter', 'uncertain')).toThrow(ModerationStoreUnavailableError)
  })

  it('never converts an unreadable ban store into not-banned or an empty set', () => {
    testInstance.sqlite.exec('DROP TABLE user_bans')

    expect(readUserBan('user-1').ok).toBe(false)
    expect(readBannedUserIds().ok).toBe(false)
    expect(() => isUserBanned('user-1')).toThrow(ModerationStoreUnavailableError)
    expect(() => listBannedUserIds()).toThrow(ModerationStoreUnavailableError)
  })

  it('never converts an unreadable post store into an empty key set', () => {
    testInstance.sqlite.exec('DROP TABLE moderated_posts')

    expect(readModeratedPostKeys().ok).toBe(false)
    expect(() => listModeratedPostKeys()).toThrow(ModerationStoreUnavailableError)
  })
})
