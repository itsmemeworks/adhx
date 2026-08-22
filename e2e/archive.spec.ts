import { expect } from '@playwright/test'
import { POST } from './constants'
import { authedTest, caption, clearArchives, countActivity, expectTheaterReady } from './helpers'

authedTest.describe('archive', () => {
  authedTest.beforeEach(() => {
    clearArchives()
  })
  authedTest.afterEach(async ({ page }) => {
    await page.request.delete(`/api/bookmarks/${POST.alpha.id}/read?platform=twitter`)
    clearArchives()
  })

  authedTest(
    'Archive removes the post from the queue; Undo puts it back; no public read pulse',
    async ({ page }) => {
      const readsBefore = countActivity('read')

      await page.goto('/collection')
      await expectTheaterReady(page)
      // Newest processedAt is ALPHA.
      await expect(caption(page, POST.alpha.text)).toBeVisible()

      await page.getByRole('button', { name: 'Archive' }).click()
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
      await expect(caption(page, POST.bravo.text)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()

      expect(countActivity('read')).toBe(readsBefore)

      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(caption(page, POST.alpha.text)).toBeVisible()

      await page.getByRole('button', { name: 'Archive' }).click()
      await expect(caption(page, POST.bravo.text)).toBeVisible()
      await page.keyboard.press('u')
      await expect(caption(page, POST.alpha.text)).toBeVisible()

      const feed = await page.request.get(
        `/api/feed?id=${POST.alpha.id}&idPlatform=twitter&hideArchived=true`,
      )
      expect(feed.ok()).toBeTruthy()
      const body = (await feed.json()) as { items?: Array<{ isArchived?: boolean }> }
      expect(body.items?.[0]?.isArchived).toBeFalsy()
    },
  )
})
