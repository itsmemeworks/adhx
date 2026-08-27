import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { createTestDb, USER_A, USER_B, createTestBookmark, type TestDbInstance } from './setup'
import {
  activity,
  adminAudit,
  analyticsEvents,
  bookmarks,
  moderatedPosts,
  userBans,
  users,
} from '@/lib/db/schema'

let mockUserId: string | null = USER_A
let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

vi.mock('@/lib/sentry', () => ({
  metricCount: vi.fn(),
  captureException: vi.fn(),
}))

import { GET as getOverview } from '@/app/api/admin/overview/route'
import { GET as getPost, POST as postPost } from '@/app/api/admin/posts/route'
import { GET as getUser, POST as postUser } from '@/app/api/admin/users/route'
import { hidePost } from '@/lib/admin/moderation'
import { recordActivity } from '@/lib/activity/record'

const ORIGINAL = process.env.ADMIN_USERNAMES

function restoreAdminEnv() {
  if (ORIGINAL === undefined) delete process.env.ADMIN_USERNAMES
  else process.env.ADMIN_USERNAMES = ORIGINAL
}

describe('admin console APIs', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    process.env.ADMIN_USERNAMES = 'admin-user'
    await testInstance.db.insert(users).values([
      { id: USER_A, username: 'admin-user', role: 'admin' },
      { id: USER_B, username: 'regular-user' },
    ])
  })

  afterEach(() => {
    testInstance.close()
    restoreAdminEnv()
  })

  it('403s overview for a non-admin', async () => {
    mockUserId = USER_B
    const res = await getOverview(new NextRequest('http://localhost/api/admin/overview'))
    expect(res.status).toBe(403)
  })

  it('uses the stored role after the legacy bootstrap environment is removed', async () => {
    delete process.env.ADMIN_USERNAMES
    const res = await getOverview(new NextRequest('http://localhost/api/admin/overview'))
    expect(res.status).toBe(200)
  })

  it('does not grant admin to a new account that reclaims a former admin username', async () => {
    await testInstance.db.delete(users).where(eq(users.id, USER_A))
    await testInstance.db.insert(users).values({
      id: 'replacement-user',
      username: 'admin-user',
    })
    mockUserId = 'replacement-user'

    const res = await getOverview(new NextRequest('http://localhost/api/admin/overview'))
    expect(res.status).toBe(403)
  })

  it('returns analytics + stats for an admin', async () => {
    testInstance.db
      .insert(analyticsEvents)
      .values({
        name: 'post.view',
        platform: 'twitter',
        bookmarkId: '1',
        createdAt: new Date().toISOString(),
      })
      .run()
    const res = await getOverview(
      new NextRequest('http://localhost/api/admin/overview?window=week'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.stats.users).toBe(2)
    expect(data.analytics.totals['post.view']).toBe(1)
    expect(data).not.toHaveProperty('userId')
  })

  it('inspects a post and hides it from the pulse', async () => {
    testInstance.db
      .insert(activity)
      .values({
        action: 'preview',
        platform: 'twitter',
        bookmarkId: '555',
        author: 'foo',
        url: '/foo/status/555',
        createdAt: new Date().toISOString(),
      })
      .run()
    testInstance.db
      .insert(analyticsEvents)
      .values({
        name: 'post.view',
        platform: 'twitter',
        bookmarkId: '555',
        createdAt: new Date().toISOString(),
      })
      .run()

    const inspected = await getPost(
      new NextRequest('http://localhost/api/admin/posts?url=twitter:555'),
    )
    expect(inspected.status).toBe(200)
    const body = await inspected.json()
    expect(body.bookmarkId).toBe('555')
    expect(body.analytics.totals['post.view']).toBe(1)
    expect(body.hidden).toBe(false)

    const hide = await postPost(
      new NextRequest('http://localhost/api/admin/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'twitter', id: '555', reason: 'risky' }),
      }),
    )
    expect(hide.status).toBe(200)
    const hid = testInstance.db.select().from(moderatedPosts).all()
    expect(hid).toHaveLength(1)
    expect(hid[0].reason).toBe('risky')
    const pulse = testInstance.db.select().from(activity).all()
    expect(pulse[0].hidden).toBe(1)
  })

  it('preserves an unknown Instagram photo route through inspect, hide, and overview', async () => {
    const sourceUrl = 'https://www.instagram.com/p/DcHXej3lt5W/'
    const inspected = await getPost(
      new NextRequest(`http://localhost/api/admin/posts?url=${encodeURIComponent(sourceUrl)}`),
    )
    const inspectedPost = await inspected.json()
    expect(inspectedPost).toMatchObject({
      platform: 'instagram',
      bookmarkId: 'DcHXej3lt5W',
      previewPath: '/p/DcHXej3lt5W',
      contentType: 'photo',
    })

    const hidden = await postPost(
      new NextRequest('http://localhost/api/admin/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: inspectedPost.platform,
          id: inspectedPost.bookmarkId,
          contentType: inspectedPost.contentType,
          reason: 'unknown photo',
        }),
      }),
    )
    expect(hidden.status).toBe(200)
    expect(testInstance.db.select().from(moderatedPosts).all()[0]).toMatchObject({
      platform: 'instagram',
      bookmarkId: 'DcHXej3lt5W',
      contentType: 'photo',
    })

    const overview = await getOverview(new NextRequest('http://localhost/api/admin/overview'))
    expect((await overview.json()).hiddenPosts).toContainEqual(
      expect.objectContaining({
        bookmarkId: 'DcHXej3lt5W',
        previewPath: '/p/DcHXej3lt5W',
      }),
    )
  })

  it('does not write a new pulse event for a hidden post', () => {
    hidePost({
      platform: 'twitter',
      bookmarkId: 'hidden-1',
      hidden: true,
      actorUserId: USER_A,
    })
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: 'hidden-1',
      author: 'foo',
      url: '/foo/status/hidden-1',
    })
    expect(testInstance.db.select().from(activity).all()).toHaveLength(0)
  })

  it('bans and unbans a user, and refuses to ban an admin', async () => {
    await testInstance.db.insert(bookmarks).values(createTestBookmark(USER_B, 'b1'))

    const looked = await getUser(
      new NextRequest('http://localhost/api/admin/users?username=regular-user'),
    )
    expect(looked.status).toBe(200)
    const profile = await looked.json()
    expect(profile.bookmarkCount).toBe(1)
    expect(profile.banned).toBe(false)
    expect(profile.isSelf).toBe(false)
    expect(profile).not.toHaveProperty('userId')
    expect(profile).not.toHaveProperty('email')

    const self = await getUser(
      new NextRequest('http://localhost/api/admin/users?username=admin-user'),
    )
    expect((await self.json()).isSelf).toBe(true)

    const banSelf = await postUser(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username: 'admin-user', banned: true }),
      }),
    )
    expect(banSelf.status).toBe(400)

    const banned = await postUser(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username: 'regular-user', banned: true, reason: 'spam' }),
      }),
    )
    expect(banned.status).toBe(200)
    expect(testInstance.db.select().from(userBans).all()).toHaveLength(1)

    const again = await getUser(
      new NextRequest('http://localhost/api/admin/users?username=regular-user'),
    )
    expect((await again.json()).banned).toBe(true)

    const unban = await postUser(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username: 'regular-user', banned: false }),
      }),
    )
    expect(unban.status).toBe(200)
    expect(testInstance.db.select().from(userBans).all()).toHaveLength(0)
  })

  it('rolls back a ban when its audit write fails', async () => {
    testInstance.sqlite.exec(`
      CREATE TRIGGER fail_ban_audit
      BEFORE INSERT ON admin_audit
      WHEN NEW.action = 'ban_user'
      BEGIN
        SELECT RAISE(ABORT, 'injected audit failure');
      END;
    `)

    const response = await postUser(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username: 'regular-user', banned: true, reason: 'spam' }),
      }),
    )

    expect(response.status).toBe(500)
    expect(testInstance.db.select().from(userBans).all()).toHaveLength(0)
    expect(testInstance.db.select().from(adminAudit).all()).toHaveLength(0)
  })

  it('rolls back an unban when its audit write fails', async () => {
    testInstance.db
      .insert(userBans)
      .values({
        userId: USER_B,
        reason: 'spam',
        createdAt: new Date().toISOString(),
        createdBy: USER_A,
      })
      .run()
    testInstance.sqlite.exec(`
      CREATE TRIGGER fail_unban_audit
      BEFORE INSERT ON admin_audit
      WHEN NEW.action = 'unban_user'
      BEGIN
        SELECT RAISE(ABORT, 'injected audit failure');
      END;
    `)

    const response = await postUser(
      new NextRequest('http://localhost/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username: 'regular-user', banned: false }),
      }),
    )

    expect(response.status).toBe(500)
    expect(testInstance.db.select().from(userBans).all()).toHaveLength(1)
    expect(testInstance.db.select().from(adminAudit).all()).toHaveLength(0)
  })
})
