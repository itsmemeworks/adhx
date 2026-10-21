import { expect, test } from '@playwright/test'
import Database from 'better-sqlite3'
import { E2E_DB_PATH } from './env'
import { E2E_CURATOR_ID, E2E_CURATOR_USERNAME, E2E_USERNAME } from './constants'
import { addSessionCookie } from './helpers'

/**
 * The admin area's happy path: the curator account is made an admin for these
 * tests (and put back after), walks the sections, opens a person, pauses and
 * resumes new work. Members are sent away; phones get a chip row.
 */
function setRole(role: 'admin' | 'user') {
  const db = new Database(E2E_DB_PATH)
  try {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, E2E_CURATOR_ID)
  } finally {
    db.close()
  }
}

test.describe('admin area', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(() => setRole('admin'))
  test.afterAll(() => {
    setRole('user')
    const db = new Database(E2E_DB_PATH)
    try {
      db.prepare("DELETE FROM server_settings WHERE key = 'processing.paused'").run()
    } finally {
      db.close()
    }
  })

  test('an admin walks the sections, opens a person and pauses new work', async ({ page }) => {
    await addSessionCookie(page, { userId: E2E_CURATOR_ID, username: E2E_CURATOR_USERNAME })
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Your ADHX, this week/ })).toBeVisible()
    await page.getByRole('link', { name: 'Month' }).click()
    await expect(page.getByRole('heading', { name: /Your ADHX, this month/ })).toBeVisible()

    const nav = page.getByRole('navigation', { name: 'Admin sections' })
    await nav.getByRole('link', { name: /People/ }).click()
    await expect(page).toHaveURL(/\/admin\/people$/)
    await expect(page.getByRole('heading', { name: 'People', level: 2 })).toBeVisible()
    await page.getByRole('link', { name: new RegExp(`@${E2E_USERNAME}`) }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/people/${E2E_USERNAME}$`))
    await expect(page.getByText('Just for me saves are counted above, never listed.')).toBeVisible()

    for (const [name, heading] of [
      ['Posts', 'Posts'],
      ['Channels', 'Channels and Live'],
      ['Live', 'Live'],
      ['Analytics', 'Analytics'],
      ['Moderation', 'Moderation'],
      ['Invites', 'Invites'],
    ] as const) {
      await nav.getByRole('link', { name: new RegExp(`^${name}`) }).click()
      await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible()
    }

    await nav.getByRole('link', { name: /^Processing/ }).click()
    await page.getByRole('button', { name: 'Pause new work' }).click()
    await expect(page.getByText('New work is paused.', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Resume new work' }).click()
    await expect(page.getByRole('button', { name: 'Pause new work' })).toBeVisible()

    await nav.getByRole('link', { name: /^Moderation/ }).click()
    const who = page.getByRole('textbox', { name: 'Username' })
    await who.fill(E2E_USERNAME)
    await who.press('Enter')
    await expect(page.getByRole('button', { name: 'Clear notes' })).toBeVisible()
  })

  test('fits a phone: the sections are a chip row and nothing scrolls sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await addSessionCookie(page, { userId: E2E_CURATOR_ID, username: E2E_CURATOR_USERNAME })
    for (const path of [
      '/admin',
      '/admin/people',
      `/admin/people/${E2E_USERNAME}`,
      '/admin/posts',
      '/admin/channels',
      '/admin/live',
      '/admin/analytics',
      '/admin/processing',
      '/admin/moderation',
      '/admin/invites',
    ]) {
      await page.goto(path)
      await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })

  test('a member is sent to Settings', async ({ page }) => {
    await addSessionCookie(page)
    await page.goto('/admin/people')
    await expect(page).toHaveURL(/\/settings/)
  })
})
