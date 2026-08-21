import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './api/setup'
import {
  getUsernameForUserId,
  getUserIdForUsername,
  resolveUsernameAlias,
} from '@/lib/users/lookup'

/**
 * `src/lib/users/lookup.ts` — canonical username lookups for friendly URLs.
 *
 * `getUsernameForUserId` is the regression-guarded function: its own comment
 * records that reading from `oauth_tokens` alone silently 404'd every share
 * action for email-only accounts (no X connection → no `oauth_tokens` row).
 * The fix reads `users` first and falls back to `oauth_tokens` only for rows
 * the startup backfill hasn't touched yet.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

beforeEach(() => {
  testInstance = createTestDb()
})

afterEach(() => {
  testInstance.close()
})

describe('getUsernameForUserId', () => {
  it('finds an X-first user via the users table (primary path)', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'x-user-1',
      username: 'alice',
    })

    expect(await getUsernameForUserId('x-user-1')).toBe('alice')
  })

  it('regression: finds an email-only user (users row only, no oauth_tokens row)', async () => {
    // Email-first accounts never get an oauth_tokens row — this is exactly
    // the shape that used to 404 every share action before the fix.
    await testInstance.db.insert(schema.users).values({
      id: 'u_email123',
      username: 'bobmail',
      email: 'bob@example.com',
    })

    expect(await getUsernameForUserId('u_email123')).toBe('bobmail')
  })

  it('falls back to oauth_tokens when no users row exists yet (pre-backfill legacy fixture)', async () => {
    await testInstance.db.insert(schema.oauthTokens).values({
      userId: 'legacy-user-1',
      username: 'legacyname',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
    })

    expect(await getUsernameForUserId('legacy-user-1')).toBe('legacyname')
  })

  it('returns null for a completely unknown userId', async () => {
    expect(await getUsernameForUserId('nobody-here')).toBeNull()
  })

  it('prefers the users table over a stale oauth_tokens row for the same userId', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'dual-row-user',
      username: 'currentname',
    })
    await testInstance.db.insert(schema.oauthTokens).values({
      userId: 'dual-row-user',
      username: 'staleoauthname',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
    })

    expect(await getUsernameForUserId('dual-row-user')).toBe('currentname')
  })
})

describe('getUserIdForUsername', () => {
  it('finds the userId via the users table', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'uid-1', username: 'carol' })

    expect(await getUserIdForUsername('carol')).toBe('uid-1')
  })

  it('falls back to oauth_tokens when no users row matches', async () => {
    await testInstance.db.insert(schema.oauthTokens).values({
      userId: 'uid-2',
      username: 'dave',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
    })

    expect(await getUserIdForUsername('dave')).toBe('uid-2')
  })

  it('returns null for an unknown username', async () => {
    expect(await getUserIdForUsername('ghost')).toBeNull()
  })
})

describe('resolveUsernameAlias', () => {
  it("resolves a stale username to its owner's current username", async () => {
    await testInstance.db.insert(schema.users).values({ id: 'renamed-user', username: 'newname' })
    await testInstance.db.insert(schema.usernameAliases).values({
      username: 'oldname',
      userId: 'renamed-user',
      createdAt: Date.now(),
    })

    const result = await resolveUsernameAlias('oldname')
    expect(result).toEqual({ userId: 'renamed-user', username: 'newname' })
  })

  it('is case-insensitive on the lookup (aliases stored lowercased)', async () => {
    await testInstance.db
      .insert(schema.users)
      .values({ id: 'renamed-user-2', username: 'freshname' })
    await testInstance.db.insert(schema.usernameAliases).values({
      username: 'staleusername',
      userId: 'renamed-user-2',
      createdAt: Date.now(),
    })

    const result = await resolveUsernameAlias('StaleUserName')
    expect(result).toEqual({ userId: 'renamed-user-2', username: 'freshname' })
  })

  it("returns null when the old username was never anyone's username (genuine 404)", async () => {
    expect(await resolveUsernameAlias('never-existed')).toBeNull()
  })

  it('returns null when the alias exists but its owner has since been deleted', async () => {
    // Alias row with no matching users/oauth_tokens row for the userId.
    await testInstance.db.insert(schema.usernameAliases).values({
      username: 'orphanalias',
      userId: 'deleted-user',
      createdAt: Date.now(),
    })

    expect(await resolveUsernameAlias('orphanalias')).toBeNull()
  })
})
