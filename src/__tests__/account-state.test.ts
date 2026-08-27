import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'
import { users } from '@/lib/db/schema'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

describe('account state', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('requires a live users row and becomes false immediately after deletion', async () => {
    await testInstance.db.insert(users).values({ id: 'user-1', username: 'reader' })
    const { hasLiveAccount } = await import('@/lib/auth/account-state')

    expect(await hasLiveAccount('user-1')).toBe(true)

    await testInstance.db.delete(users)

    expect(await hasLiveAccount('user-1')).toBe(false)
  })
})
