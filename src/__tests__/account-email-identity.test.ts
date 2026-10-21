import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDbInstance } from './api/setup'
import * as schema from '@/lib/db/schema'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

import * as dbModule from '@/lib/db'

describe('email identity claims', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    testInstance.close()
  })

  it('resolves concurrent first sign-ins to one account without orphans', async () => {
    const { findOrCreateUserForEmail } = await import('@/lib/auth/account')
    const [first, second] = await Promise.all([
      findOrCreateUserForEmail('same@example.com'),
      findOrCreateUserForEmail('same@example.com'),
    ])

    expect(first.userId).toBe(second.userId)
    expect([first.created, second.created]).toContain(true)
    expect(await testInstance.db.select().from(schema.users)).toHaveLength(1)
    expect(await testInstance.db.select().from(schema.userIdentities)).toEqual([
      expect.objectContaining({
        provider: 'email',
        providerId: 'same@example.com',
        userId: first.userId,
      }),
    ])
  })

  it('retries username conflicts with a suffix that still fits the 15-character limit', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'existing',
      username: 'abcdefghijklmno',
    })
    const { findOrCreateUserForEmail } = await import('@/lib/auth/account')

    const result = await findOrCreateUserForEmail('abcdefghijklmnopqrst@example.com')

    // The suffix fits inside the limit, so the suggestion can be claimed as is
    // (a 16th character would be cut off by the chooser, back onto the taken name).
    expect(result.username).toBe('abcdefghijklmn2')
    const { sanitizeUsername } = await import('@/lib/auth/username-rules')
    expect(sanitizeUsername(result.username)).toBe(result.username)
    expect(result.created).toBe(true)
  })

  it('suggests a claimable name for accounts that got an over-long one', async () => {
    await testInstance.db.insert(schema.users).values([
      { id: 'taken', username: 'abcdefghijklmno' },
      { id: 'legacy', username: 'abcdefghijklmno2' },
    ])
    const { claimableUsernameSuggestion } = await import('@/lib/auth/account')
    expect(await claimableUsernameSuggestion('abcdefghijklmno2', 'legacy')).toBe('abcdefghijklmn2')
    expect(await claimableUsernameSuggestion('fine_name', 'legacy')).toBe('fine_name')
  })

  it('retries a cross-worker busy snapshot during first sign-in', async () => {
    vi.spyOn(dbModule, 'runInTransaction').mockImplementationOnce(() => {
      throw Object.assign(new Error('database is locked'), {
        code: 'SQLITE_BUSY_SNAPSHOT',
      })
    })
    const { findOrCreateUserForEmail } = await import('@/lib/auth/account')

    await expect(findOrCreateUserForEmail('busy@example.com')).resolves.toMatchObject({
      username: 'busy',
      created: true,
    })
    expect(await testInstance.db.select().from(schema.users)).toHaveLength(1)
    expect(await testInstance.db.select().from(schema.userIdentities)).toHaveLength(1)
  })

  it('does not burn the old identity when two accounts claim one change target', async () => {
    await testInstance.db.insert(schema.users).values([
      { id: 'user-a', username: 'a', email: 'old-a@example.com' },
      { id: 'user-b', username: 'b', email: 'old-b@example.com' },
    ])
    await testInstance.db.insert(schema.userIdentities).values([
      {
        provider: 'email',
        providerId: 'old-a@example.com',
        userId: 'user-a',
      },
      {
        provider: 'email',
        providerId: 'old-b@example.com',
        userId: 'user-b',
      },
    ])
    const { linkEmailToUser } = await import('@/lib/auth/account')

    const results = await Promise.all([
      linkEmailToUser('user-a', 'target@example.com'),
      linkEmailToUser('user-b', 'target@example.com'),
    ])
    expect(results.filter((result) => 'ok' in result)).toHaveLength(1)
    expect(results.filter((result) => 'error' in result)).toEqual([{ error: 'email_in_use' }])

    const [target] = await testInstance.db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.providerId, 'target@example.com'))
    const loserId = target.userId === 'user-a' ? 'user-b' : 'user-a'
    const loserOldEmail = loserId === 'user-a' ? 'old-a@example.com' : 'old-b@example.com'
    expect(
      await testInstance.db
        .select()
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.providerId, loserOldEmail)),
    ).toEqual([expect.objectContaining({ provider: 'email', userId: loserId })])
    expect(
      await testInstance.db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, loserId)),
    ).toEqual([{ email: loserOldEmail }])
  })

  it('retries a busy snapshot before changing an email identity', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'user-a',
      username: 'a',
      email: 'old@example.com',
    })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'email',
      providerId: 'old@example.com',
      userId: 'user-a',
    })
    vi.spyOn(dbModule, 'runInTransaction').mockImplementationOnce(() => {
      throw Object.assign(new Error('database is locked'), {
        code: 'SQLITE_BUSY_SNAPSHOT',
      })
    })
    const { linkEmailToUser } = await import('@/lib/auth/account')

    await expect(linkEmailToUser('user-a', 'new@example.com')).resolves.toEqual({ ok: true })
    expect(await testInstance.db.select().from(schema.userIdentities)).toEqual([
      expect.objectContaining({
        provider: 'email',
        providerId: 'new@example.com',
        userId: 'user-a',
      }),
    ])
  })
})
