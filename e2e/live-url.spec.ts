import { expect } from '@playwright/test'
import { authedTest, expectTheaterReady, goNext } from './helpers'

authedTest.describe('signed-in Live vs Saved URLs', () => {
  authedTest('Live rewrites the address bar to the current post', async ({ page }) => {
    await page.goto('/live')
    await expectTheaterReady(page)
    await expect(page).toHaveURL(/\/(status\/|reels\/|reel\/|shorts\/|video\/)/)
    const firstPostUrl = page.url()
    await goNext(page)
    await expect(page).not.toHaveURL(firstPostUrl)
    // LIFO newest-first: the next pulse row may be TikTok / Reels / Shorts,
    // not another tweet. Any preview path is a Live rewrite.
    await expect(page).toHaveURL(/\/(status\/|reels\/|reel\/|shorts\/|video\/)/)
  })

  authedTest('Keep playing persists across reload on Live', async ({ page }) => {
    await page.goto('/live')
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Stop when caught up' }).click()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    // replaceState rewrites Live to a preview path — reload would open shared
    // mode. Re-enter `/live` so this asserts Live's persisted repeat, not the pin.
    await page.goto('/live')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
  })
})
