import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, FULL_SCHEMA_SQL, USER_A, type TestDbInstance } from './api/setup'
import * as schema from '@/lib/db/schema'

/**
 * "Show up in search engines" (`PUBLIC_PAGES`, Admin → System): off on a new
 * server, so it isn't crawled or listed; on, it is, at its own address.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

// The root layout's fonts and shell are beside the point here.
vi.mock('next/font/local', () => ({ default: () => ({ variable: 'font' }) }))
vi.mock('@/components/AppShell', () => ({ AppShell: () => null }))
vi.mock('@/components/next/demo/DemoBar', () => ({ DemoBar: () => null }))
vi.mock('@/lib/auth/session', () => ({ getCurrentUserId: async () => null }))

import { __resetExtrasCache, extraSource, extrasView, setExtra } from '@/lib/settings/extras'
import { publicPagesOn } from '@/lib/settings/public-pages'
import sitemap from '@/app/sitemap'
import { generateMetadata } from '@/app/layout'

function seedPublicChannel() {
  testInstance.db.insert(schema.users).values({ id: USER_A, username: 'alice' }).run()
  testInstance.db
    .insert(schema.tagShares)
    .values({ userId: USER_A, tag: 'cats', shareCode: 'share-1', isPublic: true })
    .run()
  testInstance.db
    .insert(schema.bookmarks)
    .values({
      id: '111',
      userId: USER_A,
      author: 'someone',
      text: 'A cat',
      tweetUrl: 'https://x.com/someone/status/111',
      processedAt: new Date().toISOString(),
    })
    .run()
}

beforeEach(() => {
  testInstance = createTestDb()
  __resetExtrasCache()
  vi.stubEnv('SESSION_SECRET', 's'.repeat(48))
  vi.stubEnv('PUBLIC_PAGES', '')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  vi.stubEnv('APP_URL', '')
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllEnvs()
})

describe('the setting', () => {
  it('is off when nothing is set, and shows as Off on Admin → System', () => {
    expect(publicPagesOn()).toBe(false)
    const row = extrasView().find((e) => e.name === 'PUBLIC_PAGES')
    expect(row).toMatchObject({ source: 'default', value: 'off', shown: 'Off', kind: 'choice' })
  })

  it('takes the environment’s value when nothing is saved', () => {
    vi.stubEnv('PUBLIC_PAGES', 'on')
    expect(publicPagesOn()).toBe(true)
    expect(extraSource('PUBLIC_PAGES')).toBe('env')
  })

  it('lets a saved value beat the environment, and clearing goes back to it', () => {
    vi.stubEnv('PUBLIC_PAGES', 'on')
    setExtra('PUBLIC_PAGES', 'off')
    expect(publicPagesOn()).toBe(false)
    expect(extraSource('PUBLIC_PAGES')).toBe('admin')

    vi.stubEnv('PUBLIC_PAGES', 'off')
    setExtra('PUBLIC_PAGES', 'on')
    expect(publicPagesOn()).toBe(true)

    setExtra('PUBLIC_PAGES', null)
    expect(publicPagesOn()).toBe(false)
    expect(extraSource('PUBLIC_PAGES')).toBe('env')
  })

  it('accepts only on or off', () => {
    expect(() => setExtra('PUBLIC_PAGES', 'yes')).toThrow(/on or off/i)
  })
})

describe('sitemap', () => {
  it('is empty while search engines are off, even with public channels and saves', () => {
    seedPublicChannel()
    expect(sitemap()).toEqual([])
  })

  it('lists this server’s own address when on, never adhx.com', () => {
    seedPublicChannel()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://friends.example')
    setExtra('PUBLIC_PAGES', 'on')
    const urls = sitemap().map((e) => e.url)
    expect(urls).toContain('https://friends.example/now')
    expect(urls).toContain('https://friends.example/t/alice/cats')
    expect(urls).toContain('https://friends.example/someone/status/111')
    expect(urls.every((u) => new URL(u).origin === 'https://friends.example')).toBe(true)
  })

  it('uses the address remembered at setup when the environment names none', () => {
    testInstance.db
      .insert(schema.serverSettings)
      .values({ key: 'app_url', value: 'http://192.168.1.20:3000', updatedAt: '2026-10-29' })
      .run()
    setExtra('PUBLIC_PAGES', 'on')
    expect(sitemap()[0].url).toBe('http://192.168.1.20:3000')
  })
})

describe('noindex', () => {
  it('marks every page noindex, nofollow while search engines are off', () => {
    expect(generateMetadata().robots).toMatchObject({ index: false, follow: false })
  })

  it('lets pages be indexed once the owner turns it on', () => {
    setExtra('PUBLIC_PAGES', 'on')
    expect(generateMetadata().robots).toMatchObject({ index: true, follow: true })
  })

  // Next replaces the layout's `robots` with a page's own. Preview pages,
  // /now and moments either leave it alone or narrow it to noindex; a page
  // that said `index: true` would override the switch.
  it('has no page that widens robots past the layout', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
      }
    }
    walk(path.join(process.cwd(), 'src/app'))
    walk(path.join(process.cwd(), 'src/lib'))
    const widening = files.filter((file) => {
      if (file.endsWith(path.join('settings', 'public-pages.ts'))) return false
      return /index:\s*true/.test(readFileSync(file, 'utf8'))
    })
    expect(widening).toEqual([])
  })
})

describe('upgrading an existing server', () => {
  function migrate(file: string, migrations: string, env: Record<string, string> = {}) {
    const result = spawnSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/lib/db/migrate.ts'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          ...process.env,
          DATABASE_PATH: file,
          MIGRATIONS_PATH: migrations,
          ADMIN_USERNAMES: '',
          ADMIN_USER_IDS: '',
          PUBLIC_PAGES: '',
          ...env,
        },
      },
    )
    expect(result.status, result.stdout + result.stderr).toBe(0)
  }

  function saved(file: string): string | undefined {
    const db = new Database(file)
    try {
      const row = db
        .prepare(`SELECT value FROM server_settings WHERE key = 'extra.PUBLIC_PAGES'`)
        .get() as { value: string } | undefined
      return row?.value
    } finally {
      db.close()
    }
  }

  it('keeps a server with public channels in search engines, once, and leaves others off', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'adhx-public-pages-'))
    const migrations = path.join(root, 'drizzle')
    mkdirSync(path.join(migrations, 'meta'), { recursive: true })
    writeFileSync(path.join(migrations, 'meta', '_journal.json'), JSON.stringify({ entries: [] }))
    try {
      const make = (name: string, sql: string) => {
        const file = path.join(root, `${name}.db`)
        const db = new Database(file)
        db.exec(FULL_SCHEMA_SQL)
        db.exec(sql)
        db.close()
        return file
      }
      const published = make(
        'published',
        `INSERT INTO users(id,username) VALUES('alice','alice');
         INSERT INTO tag_shares(user_id,tag,share_code,is_public) VALUES('alice','cats','c1',1);`,
      )
      const unpublished = make(
        'unpublished',
        `INSERT INTO users(id,username) VALUES('bob','bob');
         INSERT INTO tag_shares(user_id,tag,share_code,is_public) VALUES('bob','dogs','d1',0);`,
      )
      const envOff = make(
        'env-off',
        `INSERT INTO users(id,username) VALUES('cy','cy');
         INSERT INTO tag_shares(user_id,tag,share_code,is_public) VALUES('cy','owls','o1',1);`,
      )

      migrate(published, migrations)
      migrate(unpublished, migrations)
      migrate(envOff, migrations, { PUBLIC_PAGES: 'off' })
      expect(saved(published)).toBe('on')
      expect(saved(unpublished)).toBeUndefined()
      expect(saved(envOff)).toBeUndefined()

      // The owner clears it later: a restart doesn't put it back.
      const db = new Database(published)
      db.exec(`DELETE FROM server_settings WHERE key = 'extra.PUBLIC_PAGES'`)
      db.close()
      migrate(published, migrations)
      expect(saved(published)).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 120_000)
})
