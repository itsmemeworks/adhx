import { expect } from '@playwright/test'
import { POST, TIKTOK_TWIN } from './constants'
import { authedTest, caption, expectTheaterReady, goNext } from './helpers'

authedTest.describe('collection repeat', () => {
  authedTest('Saved offers the same all → one → off switch as Live', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()

    await page.getByRole('button', { name: 'Keep playing' }).click()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()
    await page.getByRole('button', { name: 'Repeat this post' }).click()
    await expect(page.getByRole('button', { name: 'Play once' })).toBeVisible()
    await page.getByRole('button', { name: 'Play once' }).click()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
  })

  authedTest('Keep playing persists across a /saved reload', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
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

    const pause = page.getByRole('button', { name: 'Pause', exact: true })
    const play = page.getByRole('button', { name: 'Play', exact: true })
    await expect(pause.or(play)).toBeVisible()
    const wasPaused = await play.isVisible()
    await page.keyboard.press(' ')
    if (wasPaused) {
      await expect(pause).toBeVisible()
    } else {
      await expect(play).toBeVisible()
    }
  })

  authedTest(
    'a deep-linked last post follows visible Next before All Clear; Keep playing restarts',
    async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('adhx-theater-repeat-saved', 'off')
      })
      await page.goto(`/saved?open=${TIKTOK_TWIN.id}&platform=tiktok`)
      await expectTheaterReady(page)
      await expect(caption(page, TIKTOK_TWIN.text)).toBeVisible()
      await goNext(page)
      await expect(page.getByRole('heading', { name: 'All caught up' })).toHaveCount(0)

      const allClear = page.getByRole('heading', { name: 'All caught up' })
      for (let step = 0; step < 20 && !(await allClear.isVisible()); step += 1) {
        await goNext(page)
      }
      await expect(allClear).toBeVisible()
      await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()

      await page.keyboard.press('p')
      await expect(allClear).toHaveCount(0)
      await expect(caption(page, POST.alpha.text)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    },
  )
})
