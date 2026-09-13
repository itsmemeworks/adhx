import Database from 'better-sqlite3'
import { expect } from '@playwright/test'
import { authedTest as test } from './helpers'
import { E2E_USER_ID } from './constants'
import { E2E_DB_PATH } from './env'

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Settings reveals an active sync at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const db = new Database(E2E_DB_PATH)
    const syncId = `e2e-sync-progress-${viewport.width}`
    const now = new Date().toISOString()
    try {
      db.prepare('DELETE FROM sync_logs WHERE user_id = ?').run(E2E_USER_ID)
      db.prepare(
        `INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at)
         VALUES (?, 'e2e-unused', 'e2e-unused', ?)`,
      ).run(E2E_USER_ID, now)
      db.prepare(
        `INSERT INTO sync_logs (id, user_id, status, started_at, heartbeat_at, total_fetched, new_bookmarks, duplicates_skipped)
         VALUES (?, ?, 'running', ?, ?, 10, 2, 1)`,
      ).run(syncId, E2E_USER_ID, now, now)
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        await route.fulfill({
          response,
          json: {
            ...body,
            xConnected: true,
            identities: { ...body.identities, x: { username: 'e2esync' } },
          },
        })
      })
      await page.addInitScript(() => {
        localStorage.setItem('adhx-last-visible-at', String(Date.now() - 48 * 60 * 60 * 1000))
      })
      let streams = 0
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/sync') streams++
      })
      await page.goto('/settings')
      await expect.poll(() => streams).toBe(1)
      const dialog = page.getByRole('dialog', { name: 'Bookmark sync' })
      await expect(dialog).not.toBeVisible()
      await page.getByRole('button', { name: /sync now/i }).click()
      await expect(dialog.getByText('Processing 3 of 10')).toBeVisible()
      await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
      db.prepare(
        'UPDATE sync_logs SET new_bookmarks = 5, duplicates_skipped = 2 WHERE id = ? AND user_id = ?',
      ).run(syncId, E2E_USER_ID)
      await expect(dialog.getByText('Processing 7 of 10')).toBeVisible()
      await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70')
      await page.screenshot({ path: test.info().outputPath('active-sync.png') })
      db.prepare(
        "UPDATE sync_logs SET status = 'completed', completed_at = ?, new_bookmarks = 8 WHERE id = ? AND user_id = ?",
      ).run(new Date().toISOString(), syncId, E2E_USER_ID)
      await expect(dialog.getByText('Sync Complete!')).toBeVisible()
      await expect(page.getByText('Bookmarks synced successfully!')).toBeVisible()
      expect(streams).toBe(1)
    } finally {
      await page.close()
      db.prepare('DELETE FROM sync_logs WHERE user_id = ?').run(E2E_USER_ID)
      db.prepare('DELETE FROM oauth_tokens WHERE user_id = ?').run(E2E_USER_ID)
      db.close()
    }
  })
}
