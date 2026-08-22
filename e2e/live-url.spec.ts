import { expect } from '@playwright/test'
import { POST } from './constants'
import { authedTest, expectTheaterReady, goNext } from './helpers'

authedTest.describe('signed-in Live vs My Collection URLs', () => {
  authedTest('Live rewrites the address bar to the current post', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page).toHaveURL(new RegExp(`/${POST.preview.author}/status/${POST.preview.id}`), {
      timeout: 15_000,
    })
    await goNext(page)
    await expect(page).not.toHaveURL(new RegExp(`/status/${POST.preview.id}`))
    await expect(page).toHaveURL(/\/status\//)
  })

  authedTest('My Collection keeps /collection while advancing', async ({ page }) => {
    await page.goto('/collection')
    await expectTheaterReady(page)
    await expect(page).toHaveURL(/\/collection/)
    await goNext(page)
    await expect(page).toHaveURL(/\/collection/)
    await expect(page).not.toHaveURL(/\/status\//)
  })

  authedTest('Keep playing persists across reload on Live', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Stop when caught up' }).click()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    // replaceState rewrites Live to a preview path — reload would open shared
    // mode. Re-enter `/` so this asserts Live's persisted repeat, not the pin.
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
  })
})
