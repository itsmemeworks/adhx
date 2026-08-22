import { expect } from '@playwright/test'
import { POST, TIKTOK_TWIN } from './constants'
import { authedTest, caption, expectTheaterReady, goNext } from './helpers'

authedTest.describe('collection repeat', () => {
  authedTest('My Collection offers the same off → all → one switch as Live', async ({ page }) => {
    await page.goto('/collection')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()

    await page.getByRole('button', { name: 'Stop when caught up' }).click()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    await page.getByRole('button', { name: 'Keep playing' }).click()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()
    await page.getByRole('button', { name: 'Repeat this post' }).click()
    await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()
  })

  authedTest('Keep playing persists across a /collection reload', async ({ page }) => {
    await page.goto('/collection')
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Stop when caught up' }).click()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    await page.goto('/collection')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
  })

  authedTest('Next past the last post shows All Clear; Keep playing restarts', async ({ page }) => {
    await page.goto(`/collection?open=${TIKTOK_TWIN.id}&platform=tiktok`)
    await expectTheaterReady(page)
    await expect(caption(page, TIKTOK_TWIN.text)).toBeVisible()
    await goNext(page)
    await expect(page.getByRole('heading', { name: 'All caught up' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()

    await page.getByRole('button', { name: 'Keep playing' }).click()
    await expect(page.getByRole('heading', { name: 'All caught up' })).toHaveCount(0)
    await expect(caption(page, POST.alpha.text)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
  })
})
