import { expect } from '@playwright/test'
import { POST } from './constants'
import { authedTest, expectTheaterReady, goNext } from './helpers'

authedTest.describe('signed-in Live vs Saved URLs', () => {
  authedTest('Live rewrites the address bar to the current post', async ({ page }) => {
    await page.goto('/live')
    await expectTheaterReady(page)
    await expect(page).toHaveURL(new RegExp(`/${POST.preview.author}/status/${POST.preview.id}`), {
      timeout: 15_000,
    })
    await goNext(page)
    await expect(page).not.toHaveURL(new RegExp(`/status/${POST.preview.id}`))
    await expect(page).toHaveURL(/\/status\//)
  })

  authedTest('Saved keeps /saved while advancing', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page).toHaveURL(/\/saved/)
    await goNext(page)
    await expect(page).toHaveURL(/\/saved/)
    await expect(page).not.toHaveURL(/\/status\//)
  })

  authedTest('clicking Saved after Live restores /saved', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await expect(page).toHaveURL(/\/status\//, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    await expect(page).toHaveURL(/\/saved/)
    await expect(page).not.toHaveURL(/\/status\//)
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
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
