import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './api/setup'

/**
 * Unit tests for the username claim/change core logic —
 * `chooseUsername()`/`isUsernameTaken()` in `src/lib/auth/account.ts`.
 *
 * The HTTP layer (status codes, session cookie, response shape) is covered
 * by `src/__tests__/api/auth-username.test.ts` — this file exercises the
 * change/alias/cap rules directly against an in-memory DB:
 *
 * - the first claim is free and never counts or aliases the old name
 * - each subsequent change costs one of MAX_USERNAME_CHANGES and aliases
 *   the name being left behind
 * - the cap rejects a third counted change
 * - reclaiming your own past username is always allowed and frees its alias
 * - a name aliased to someone else blocks availability for everyone else
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

import { chooseUsername, isUsernameTaken } from '@/lib/auth/account'
import { MAX_USERNAME_CHANGES } from '@/lib/auth/username-rules'

async function userRow(userId: string) {
  const [row] = await testInstance.db.select().from(schema.users).where(eq(schema.users.id, userId))
  return row
}

async function aliasRows() {
  return testInstance.db.select().from(schema.usernameAliases)
}

describe('chooseUsername', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('the first claim is free: no alias, change count stays 0', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u1', username: 'derived-name' })

    const result = await chooseUsername('u1', 'chosen')
    expect(result).toEqual({ ok: true, username: 'chosen', changesRemaining: MAX_USERNAME_CHANGES })

    const user = await userRow('u1')
    expect(user.username).toBe('chosen')
    expect(user.usernameChosen).toBe(true)
    expect(user.usernameChangeCount).toBe(0)
    expect(await aliasRows()).toHaveLength(0)
  })

  it('spends changes one at a time and aliases the name left behind', async () => {
    await testInstance.db
      .insert(schema.users)
      .values({ id: 'u1', username: 'first', usernameChosen: true })

    const change1 = await chooseUsername('u1', 'second')
    expect(change1).toEqual({ ok: true, username: 'second', changesRemaining: 1 })
    let user = await userRow('u1')
    expect(user.usernameChangeCount).toBe(1)
    let aliases = await aliasRows()
    expect(aliases.map((a) => a.username)).toEqual(['first'])
    expect(aliases[0].userId).toBe('u1')

    const change2 = await chooseUsername('u1', 'third')
    expect(change2).toEqual({ ok: true, username: 'third', changesRemaining: 0 })
    user = await userRow('u1')
    expect(user.usernameChangeCount).toBe(2)
    aliases = await aliasRows()
    expect(aliases.map((a) => a.username).sort()).toEqual(['first', 'second'])
  })

  it('rejects a third counted change with change_limit_reached', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'u1',
      username: 'current',
      usernameChosen: true,
      usernameChangeCount: MAX_USERNAME_CHANGES,
    })

    const result = await chooseUsername('u1', 'onemore')
    expect(result).toEqual({ error: 'change_limit_reached' })

    const user = await userRow('u1')
    expect(user.username).toBe('current') // untouched
    expect(await aliasRows()).toHaveLength(0)
  })

  it('resubmitting the current username is a free no-op past the cap', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'u1',
      username: 'current',
      usernameChosen: true,
      usernameChangeCount: MAX_USERNAME_CHANGES,
    })

    const result = await chooseUsername('u1', 'CURRENT')
    expect(result).toEqual({ ok: true, username: 'current', changesRemaining: 0 })
    const user = await userRow('u1')
    expect(user.usernameChangeCount).toBe(MAX_USERNAME_CHANGES)
  })

  it('blocks a name aliased to a different account', async () => {
    await testInstance.db.insert(schema.users).values([
      { id: 'u1', username: 'me', usernameChosen: true },
      { id: 'u2', username: 'other' },
    ])
    await testInstance.db
      .insert(schema.usernameAliases)
      .values({ username: 'held-by-u2', userId: 'u2', createdAt: Date.now() })

    const result = await chooseUsername('u1', 'held-by-u2')
    expect(result).toEqual({ error: 'taken' })
    expect(await isUsernameTaken('held-by-u2', 'u1')).toBe(true)
    expect(await isUsernameTaken('held-by-u2', 'u2')).toBe(false)
  })

  it('reclaiming your own past username is never blocked as "taken", and frees the alias', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'u1',
      username: 'current',
      usernameChosen: true,
      usernameChangeCount: 1, // one change left
    })
    await testInstance.db
      .insert(schema.usernameAliases)
      .values({ username: 'my-old-name', userId: 'u1', createdAt: Date.now() })

    // Reclaiming still costs a change like any other — it's just never
    // rejected as "taken" for an alias the caller already owns.
    const result = await chooseUsername('u1', 'my-old-name')
    expect(result).toEqual({ ok: true, username: 'my-old-name', changesRemaining: 0 })

    const aliases = await aliasRows()
    // The reclaimed alias is freed; the name just vacated becomes the new alias.
    expect(aliases.map((a) => a.username)).toEqual(['current'])
    expect(aliases[0].userId).toBe('u1')

    const user = await userRow('u1')
    expect(user.username).toBe('my-old-name')
  })

  it('the cap still applies to reclaiming your own past username once spent', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'u1',
      username: 'current',
      usernameChosen: true,
      usernameChangeCount: MAX_USERNAME_CHANGES, // cap already spent
    })
    await testInstance.db
      .insert(schema.usernameAliases)
      .values({ username: 'my-old-name', userId: 'u1', createdAt: Date.now() })

    const result = await chooseUsername('u1', 'my-old-name')
    expect(result).toEqual({ error: 'change_limit_reached' })
  })

  it('rejects invalid grammar and unknown users', async () => {
    await testInstance.db.insert(schema.users).values({ id: 'u1', username: 'me' })
    expect(await chooseUsername('u1', '--')).toEqual({ error: 'invalid' })
    expect(await chooseUsername('ghost', 'whatever')).toEqual({ error: 'invalid' })
  })
})
