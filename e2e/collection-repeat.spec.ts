import { expect } from '@playwright/test'
import { POST, TIKTOK_TWIN } from './constants'
import { authedTest, caption, expectTheaterReady, goNext } from './helpers'

authedTest.describe('collection repeat', () => {
  authedTest('Saved offers the same off → all → one switch as Live', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()

    await page.getByRole('button', { name: 'Stop when caught up' }).click()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    await page.getByRole('button', { name: 'Keep playing' }).click()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()
    await page.getByRole('button', { name: 'Repeat this post' }).click()
    await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()
  })

  authedTest('Keep playing persists across a /saved reload', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Stop when caught up' }).click()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
  })

  authedTest('collection is not the live waiting stage — Space still pauses', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page.getByText('waiting for new sends')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()

    const pause = page.getByRole('button', { name: 'Pause' })
    const play = page.getByRole('button', { name: 'Play' })
    await expect(pause.or(play)).toBeVisible()
    const wasPaused = await play.isVisible()
    await page.keyboard.press(' ')
    if (wasPaused) {
      await expect(pause).toBeVisible()
    } else {
      await expect(play).toBeVisible()
    }
  })

  authedTest('Next past the last post shows All Clear; Keep playing restarts', async ({ page }) => {
    await page.goto(`/saved?open=${TIKTOK_TWIN.id}&platform=tiktok`)
    await expectTheaterReady(page)
    await expect(caption(page, TIKTOK_TWIN.text)).toBeVisible()
    await goNext(page)
    await expect(page.getByRole('heading', { name: 'All caught up' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()

    await page.keyboard.press('p')
    await expect(page.getByRole('heading', { name: 'All caught up' })).toHaveCount(0)
    await expect(caption(page, POST.alpha.text)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
  })
})
