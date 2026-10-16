import { expect } from '@playwright/test'
import { POST } from './constants'
import { apiDeleteBookmark, authedTest, expectTheaterReady, goNext } from './helpers'

authedTest.describe('signed-in navigation', () => {
  authedTest.afterEach(async ({ page }) => {
    await apiDeleteBookmark(page, POST.preview.id)
  })

  authedTest('j advances Live the same way Next post does', async ({ page }) => {
    await page.goto('/live')
    await expectTheaterReady(page)
    const first = page.url()
    await page.keyboard.press('j')
    await expect(page).not.toHaveURL(first)
    await expect(page).toHaveURL(/\/status\//)
    await goNext(page)
    await expect(page).toHaveURL(/\/status\//)
  })
})
