import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './api/setup'

/**
 * Unit tests for `findOrCreateUserForX()` in `src/lib/auth/account.ts` —
 * the signed-in X-link resolver used by `GET /api/auth/twitter/callback`.
 * X is not a sign-in method: no session → `sign_in_required`.
 *
 * Regression coverage for Sentry WHITE-SUN-6317-17: `SqliteError: UNIQUE
 * constraint failed: users.id`. The bug: an X-first account (`users.id ==
 * xUserId`) that later linked an email and called `unlinkX()` keeps its
 * `users` row but loses its `user_identities` row. A subsequent unsigned X
 * callback must not create or silently sign in; a signed-in owner can relink.
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
import { findOrCreateUserForX, unlinkX } from '@/lib/auth/account'
import { saveLinkedXTokens } from '@/lib/auth/oauth'

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
const OTHER_X_USER = {
  xUserId: '222',
  username: 'otherx',
  name: 'Other X',
  profileImageUrl: null,
}

describe('findOrCreateUserForX', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    testInstance.close()
  })

  it('refuses to create an account from X when there is no session', async () => {
    const result = await findOrCreateUserForX(X_USER)
    expect(result).toEqual({
      userId: '',
      username: '',
      created: false,
      conflict: 'sign_in_required',
    })
    expect(await userRow('111')).toBeUndefined()
    expect(await xIdentityRows()).toHaveLength(0)
  })

  it('is idempotent for a returning X link (identity already exists)', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })
    await findOrCreateUserForX(X_USER, 'u_email1')
    const result = await findOrCreateUserForX(X_USER, 'u_email1')
    expect(result).toEqual({ userId: 'u_email1', username: 'emailer', created: false })
    expect(await xIdentityRows()).toHaveLength(1)
  })

  it('refuses to sign in an existing X identity when there is no session', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })
    await findOrCreateUserForX(X_USER, 'u_email1')
    const result = await findOrCreateUserForX(X_USER)
    expect(result).toEqual({
      userId: '',
      username: '',
      created: false,
      conflict: 'sign_in_required',
    })
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

  it('rejects linking a different X identity when the session already owns one', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })
    await findOrCreateUserForX(X_USER, 'u_email1')

    const result = await findOrCreateUserForX(OTHER_X_USER, 'u_email1')

    expect(result).toEqual({
      userId: 'u_email1',
      username: '',
      created: false,
      conflict: 'linked_elsewhere',
    })
    expect(await xIdentityRows()).toEqual([
      expect.objectContaining({ providerId: '111', userId: 'u_email1' }),
    ])
  })

  it('allows exactly one winner when different X identities link concurrently', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })

    const results = await Promise.all([
      findOrCreateUserForX(X_USER, 'u_email1'),
      findOrCreateUserForX(OTHER_X_USER, 'u_email1'),
    ])

    expect(results.filter((result) => !result.conflict)).toHaveLength(1)
    expect(results.filter((result) => result.conflict === 'linked_elsewhere')).toHaveLength(1)
    const identities = await xIdentityRows()
    expect(identities).toHaveLength(1)
    expect(['111', '222']).toContain(identities[0].providerId)
  })

  it('durably rejects a second X identity even outside the resolver', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'x',
      providerId: '111',
      userId: 'u_email1',
    })

    await expect(
      testInstance.db.insert(schema.userIdentities).values({
        provider: 'x',
        providerId: '222',
        userId: 'u_email1',
      }),
    ).rejects.toThrow(/UNIQUE/)
  })

  it('disconnects the sole X identity and token atomically while retaining email', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'email',
      providerId: 'reader@example.com',
      userId: 'u_email1',
    })
    await findOrCreateUserForX(X_USER, 'u_email1')
    await testInstance.db.insert(schema.oauthTokens).values({
      userId: 'u_email1',
      username: 'exuser',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
    await testInstance.db.insert(schema.oauthState).values({
      state: 'pending-link',
      codeVerifier: 'verifier',
      userId: 'u_email1',
      xLinkVersion: 0,
    })

    expect(await unlinkX('u_email1')).toEqual({ ok: true })
    expect(await xIdentityRows()).toHaveLength(0)
    expect(await testInstance.db.select().from(schema.oauthTokens)).toHaveLength(0)
    expect(
      await testInstance.db
        .select()
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.provider, 'email')),
    ).toHaveLength(1)
    expect(await testInstance.db.select().from(schema.oauthState)).toHaveLength(0)
    expect(await userRow('u_email1')).toMatchObject({ xLinkVersion: 1 })
  })

  it('does not recreate tokens when disconnect wins after callback identity resolution', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'email',
      providerId: 'reader@example.com',
      userId: 'u_email1',
    })
    await findOrCreateUserForX(X_USER, 'u_email1', 0)

    // The callback has resolved/linked X but is paused before token finalize.
    expect(await unlinkX('u_email1')).toEqual({ ok: true })
    const saved = await saveLinkedXTokens(
      'u_email1',
      '111',
      'exuser',
      null,
      'late-access',
      'late-refresh',
      7200,
      'tweet.read',
      0,
    )

    expect(saved).toBe(false)
    expect(await xIdentityRows()).toHaveLength(0)
    expect(await testInstance.db.select().from(schema.oauthTokens)).toHaveLength(0)
  })

  it('rejects stale identity linking when disconnect wins before callback resolution', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'email',
      providerId: 'reader@example.com',
      userId: 'u_email1',
    })

    expect(await unlinkX('u_email1')).toEqual({ ok: true })
    const result = await findOrCreateUserForX(X_USER, 'u_email1', 0)

    expect(result.conflict).toBe('stale_link')
    expect(await xIdentityRows()).toHaveLength(0)
  })

  it('allows a fresh OAuth generation to reconnect after disconnect', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'emailer' })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'email',
      providerId: 'reader@example.com',
      userId: 'u_email1',
    })
    await findOrCreateUserForX(X_USER, 'u_email1', 0)
    expect(await unlinkX('u_email1')).toEqual({ ok: true })

    const { saveOAuthState, consumeOAuthState } = await import('@/lib/auth/oauth')
    await saveOAuthState('fresh-reconnect', 'fresh-verifier', 'u_email1')
    const consumed = await consumeOAuthState('fresh-reconnect', 'u_email1')
    expect(consumed).toEqual({ codeVerifier: 'fresh-verifier', xLinkVersion: 1 })

    const linked = await findOrCreateUserForX(X_USER, 'u_email1', consumed!.xLinkVersion)
    expect(linked.conflict).toBeUndefined()
    expect(
      await saveLinkedXTokens(
        'u_email1',
        '111',
        'exuser',
        null,
        'fresh-access',
        'fresh-refresh',
        7200,
        'tweet.read',
        consumed!.xLinkVersion,
      ),
    ).toBe(true)
    expect(await xIdentityRows()).toHaveLength(1)
    expect(await testInstance.db.select().from(schema.oauthTokens)).toHaveLength(1)
  })

  it('reports linked_elsewhere and leaves the session untouched when the X identity belongs to someone else', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_owner', username: 'exuser' })
    await findOrCreateUserForX(X_USER, 'u_owner')
    await testInstance.db.insert(schema.users).values({ id: 'u_other', username: 'other' })

    const result = await findOrCreateUserForX(X_USER, 'u_other')
    expect(result.conflict).toBe('linked_elsewhere')
    expect(result.userId).toBe('u_owner')

    // Nothing about the signed-in user or the identity ownership changed.
    expect(await userRow('u_other')).toMatchObject({ id: 'u_other', username: 'other' })
    const identities = await xIdentityRows()
    expect(identities).toHaveLength(1)
    expect(identities[0].userId).toBe('u_owner')
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

    it('does not silently sign in when reconnecting a detached X id with no session', async () => {
      await seedDetachedXAccount()

      const result = await findOrCreateUserForX(X_USER)
      expect(result.conflict).toBe('sign_in_required')
      expect(await xIdentityRows()).toHaveLength(0)
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

      const result = await findOrCreateUserForX(X_USER, '111')
      expect(result.conflict).toBeUndefined()
      expect(result.userId).toBe('111')
      expect(await xIdentityRows()).toHaveLength(1)

      spy.mockRestore()
    })
  })

  describe('cross-platform id collision safety', () => {
    it('never mutates an unrelated existing user with a different id', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'unrelated', username: 'someone' })
      const result = await findOrCreateUserForX(X_USER)
      expect(result.conflict).toBe('sign_in_required')

      const unrelated = await userRow('unrelated')
      expect(unrelated).toMatchObject({ id: 'unrelated', username: 'someone' })
    })
  })

  it('refreshes display name/avatar for a normal returning login without duplicating rows', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u_email1', username: 'exuser' })
    await findOrCreateUserForX(X_USER, 'u_email1')
    const updated = await findOrCreateUserForX(
      {
        ...X_USER,
        name: 'New Name',
        profileImageUrl: 'https://example.com/a.jpg',
      },
      'u_email1',
    )
    expect(updated).toEqual({ userId: 'u_email1', username: 'exuser', created: false })

    const user = await userRow('u_email1')
    expect(user.displayName).toBe('New Name')
    expect(user.avatarUrl).toBe('https://example.com/a.jpg')

    const allUsers = await testInstance.db.select().from(schema.users)
    expect(allUsers).toHaveLength(1)
  })

  it('does not update profile when disconnect wins existing-identity finalization', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'u_email1',
      username: 'exuser',
      displayName: 'Original Name',
      avatarUrl: 'https://example.com/original.jpg',
    })
    await testInstance.db.insert(schema.userIdentities).values([
      {
        provider: 'email',
        providerId: 'reader@example.com',
        userId: 'u_email1',
      },
      {
        provider: 'x',
        providerId: '111',
        userId: 'u_email1',
      },
    ])
    vi.spyOn(dbModule, 'runInTransaction').mockImplementationOnce((fn: () => unknown) => {
      testInstance.sqlite.exec(`
        UPDATE users SET x_link_version = x_link_version + 1 WHERE id = 'u_email1';
        DELETE FROM user_identities WHERE provider = 'x' AND user_id = 'u_email1';
      `)
      return testInstance.sqlite.transaction(fn)()
    })

    const result = await findOrCreateUserForX(
      {
        ...X_USER,
        name: 'Stale Name',
        profileImageUrl: 'https://example.com/stale.jpg',
      },
      'u_email1',
      0,
    )

    expect(result.conflict).toBe('stale_link')
    expect(await userRow('u_email1')).toMatchObject({
      displayName: 'Original Name',
      avatarUrl: 'https://example.com/original.jpg',
      xLinkVersion: 1,
    })
    expect(await xIdentityRows()).toHaveLength(0)
  })

  it('does not link or update profile when disconnect wins fresh-link finalization', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'u_email1',
      username: 'emailer',
      displayName: 'Original Name',
      avatarUrl: 'https://example.com/original.jpg',
    })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'email',
      providerId: 'reader@example.com',
      userId: 'u_email1',
    })
    vi.spyOn(dbModule, 'runInTransaction').mockImplementationOnce((fn: () => unknown) => {
      testInstance.sqlite.exec(
        `UPDATE users SET x_link_version = x_link_version + 1 WHERE id = 'u_email1'`,
      )
      return testInstance.sqlite.transaction(fn)()
    })

    const result = await findOrCreateUserForX(
      {
        ...X_USER,
        name: 'Stale Name',
        profileImageUrl: 'https://example.com/stale.jpg',
      },
      'u_email1',
      0,
    )

    expect(result.conflict).toBe('stale_link')
    expect(await userRow('u_email1')).toMatchObject({
      displayName: 'Original Name',
      avatarUrl: 'https://example.com/original.jpg',
      xLinkVersion: 1,
    })
    expect(await xIdentityRows()).toHaveLength(0)
  })
})
