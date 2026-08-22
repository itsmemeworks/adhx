import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './api/setup'

/**
 * Unit tests for `findOrCreateUserForX()` in `src/lib/auth/account.ts` —
 * the X-login → app-account resolver used by
 * `GET /api/auth/twitter/callback`.
 *
 * Regression coverage for Sentry WHITE-SUN-6317-17: `SqliteError: UNIQUE
 * constraint failed: users.id`. The bug: an X-first account (`users.id ==
 * xUserId`) that later linked an email and called `unlinkX()` keeps its
 * `users` row but loses its `user_identities` row. A subsequent X login with
 * no session (or a race between two concurrent callbacks) treated the id as
 * free and blind-inserted into `users`, crashing on the id collision instead
 * of taking the documented `x_already_linked` / relink path.
 */

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
import { findOrCreateUserForX } from '@/lib/auth/account'

async function userRow(userId: string) {
  const [row] = await testInstance.db.select().from(schema.users).where(eq(schema.users.id, userId))
  return row
}

async function xIdentityRows() {
  return testInstance.db
    .select()
    .from(schema.userIdentities)
    .where(eq(schema.userIdentities.provider, 'x'))
}

const X_USER = { xUserId: '111', username: 'exuser', name: 'Ex User', profileImageUrl: null }

describe('findOrCreateUserForX', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('creates a brand new user keyed by the X id when nothing exists yet', async () => {
    const result = await findOrCreateUserForX(X_USER)
    expect(result).toEqual({ userId: '111', username: 'exuser', created: true })

    const user = await userRow('111')
    expect(user).toMatchObject({ id: '111', username: 'exuser', usernameChosen: true })
    const identities = await xIdentityRows()
    expect(identities).toEqual([
      expect.objectContaining({ provider: 'x', providerId: '111', userId: '111' }),
    ])
  })

  it('is idempotent for a normal returning X login (identity already exists)', async () => {
    await findOrCreateUserForX(X_USER)
    const result = await findOrCreateUserForX(X_USER)
    expect(result).toEqual({ userId: '111', username: 'exuser', created: false })
    expect(await xIdentityRows()).toHaveLength(1)
  })

  it('links a fresh X account to the current session (email user connecting X)', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })

    const result = await findOrCreateUserForX(X_USER, 'u_email1')
    expect(result).toEqual({ userId: 'u_email1', username: 'emailer', created: false })

    const identities = await xIdentityRows()
    expect(identities).toEqual([
      expect.objectContaining({ provider: 'x', providerId: '111', userId: 'u_email1' }),
    ])
  })

  it('reports linked_elsewhere and leaves the session untouched when the X identity belongs to someone else', async () => {
    await findOrCreateUserForX(X_USER) // creates account '111' owning the X identity
    await testInstance.db.insert(schema.users).values({ id: 'u_other', username: 'other' })

    const result = await findOrCreateUserForX(X_USER, 'u_other')
    expect(result.conflict).toBe('linked_elsewhere')
    expect(result.userId).toBe('111')

    // Nothing about the signed-in user or the identity ownership changed.
    expect(await userRow('u_other')).toMatchObject({ id: 'u_other', username: 'other' })
    const identities = await xIdentityRows()
    expect(identities).toHaveLength(1)
    expect(identities[0].userId).toBe('111')
  })

  describe('the users-row-without-identity gap (Sentry WHITE-SUN-6317-17)', () => {
    async function seedDetachedXAccount() {
      // Simulates an X-first account that later added an email identity and
      // called unlinkX(): the `users` row (id == old X id) survives, but its
      // `user_identities` row for provider 'x' is gone.
      await testInstance.db.insert(schema.users).values({
        id: '111',
        username: 'exuser',
        displayName: 'Ex User',
        email: 'ex@example.com',
        usernameChosen: true,
      })
      await testInstance.db
        .insert(schema.userIdentities)
        .values({ provider: 'email', providerId: 'ex@example.com', userId: '111' })
    }

    it('relinks X to the existing account instead of crashing when reconnecting with no session', async () => {
      await seedDetachedXAccount()

      const result = await findOrCreateUserForX(X_USER)
      expect(result).toEqual({ userId: '111', username: 'exuser', created: false })

      const identities = await xIdentityRows()
      expect(identities).toEqual([
        expect.objectContaining({ provider: 'x', providerId: '111', userId: '111' }),
      ])
      // The original users row was reused, not duplicated or replaced.
      expect(await userRow('111')).toMatchObject({ id: '111', email: 'ex@example.com' })
    })

    it('reports linked_elsewhere (no crash, session untouched) when a DIFFERENT session tries to claim the id', async () => {
      await seedDetachedXAccount()
      await testInstance.db.insert(schema.users).values({ id: 'u_signedin', username: 'signedin' })

      const result = await findOrCreateUserForX(X_USER, 'u_signedin')
      expect(result.conflict).toBe('linked_elsewhere')
      expect(result.userId).toBe('111')

      // No new identity row was created linking X to the wrong account.
      const identities = await xIdentityRows()
      expect(identities).toHaveLength(0)
      expect(await userRow('u_signedin')).toMatchObject({ id: 'u_signedin', username: 'signedin' })
    })

    it('is idempotent when the caller session already IS the detached account', async () => {
      await seedDetachedXAccount()

      const result = await findOrCreateUserForX(X_USER, '111')
      expect(result).toEqual({ userId: '111', username: 'exuser', created: false })
      expect(await xIdentityRows()).toHaveLength(1)
    })

    it('does not throw when the constraint fires anyway (simulated lost race) and re-resolves cleanly', async () => {
      await seedDetachedXAccount()

      // Simulate two concurrent callbacks that both found no 'x' identity row
      // and both decided to relink it to the detached account: the "winner"
      // commits its insert first (from inside our spy, standing in for the
      // other request), then the real transaction runs and hits the resulting
      // constraint violation — this is exactly what the try/catch + retry
      // loop in findOrCreateUserForX must absorb instead of throwing.
      const spy = vi
        .spyOn(dbModule, 'runInTransaction')
        .mockImplementationOnce((fn: () => unknown) => {
          testInstance.sqlite
            .transaction(() => {
              testInstance.db
                .insert(schema.userIdentities)
                .values({ provider: 'x', providerId: '111', userId: '111' })
                .run()
            })
            .call(null)
          // Now run the resolver's own (real) transaction, which will hit the
          // PRIMARY KEY collision on `user_identities` from the winner above.
          return testInstance.sqlite.transaction(fn)()
        })

      const result = await findOrCreateUserForX(X_USER)
      expect(result.conflict).toBeUndefined()
      expect(result.userId).toBe('111')
      expect(await xIdentityRows()).toHaveLength(1)

      spy.mockRestore()
    })
  })

  describe('cross-platform id collision safety', () => {
    it('never mutates an unrelated existing user with a different id', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'unrelated', username: 'someone' })
      await findOrCreateUserForX(X_USER)

      const unrelated = await userRow('unrelated')
      expect(unrelated).toMatchObject({ id: 'unrelated', username: 'someone' })
    })
  })

  it('refreshes display name/avatar for a normal returning login without duplicating rows', async () => {
    await findOrCreateUserForX(X_USER)
    const updated = await findOrCreateUserForX({
      ...X_USER,
      name: 'New Name',
      profileImageUrl: 'https://example.com/a.jpg',
    })
    expect(updated).toEqual({ userId: '111', username: 'exuser', created: false })

    const user = await userRow('111')
    expect(user.displayName).toBe('New Name')
    expect(user.avatarUrl).toBe('https://example.com/a.jpg')

    const allUsers = await testInstance.db.select().from(schema.users)
    expect(allUsers).toHaveLength(1)
  })
})
