import { expect } from '@playwright/test'
import { POST } from './constants'
import {
  authedTest,
  caption,
  clearArchives,
  countActivity,
  expectTheaterReady,
  goNext,
  readQueueProgress,
  visibleQueueCount,
} from './helpers'

authedTest.describe('archive', () => {
  authedTest.beforeEach(() => {
    clearArchives()
  })
  authedTest.afterEach(async ({ page }) => {
    await page.request.delete(`/api/bookmarks/${POST.alpha.id}/read?platform=twitter`)
    await page.request.delete(`/api/bookmarks/${POST.bravo.id}/read?platform=twitter`)
    clearArchives()
  })

  authedTest(
    'Archive removes the post from the queue; Undo puts it back; no public read pulse',
    async ({ page }) => {
      const readsBefore = countActivity('read')

      await page.goto('/saved')
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

  authedTest(
    'Play once keeps the 1-based position when Archive shortens the list',
    async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('adhx-theater-repeat-saved', 'off')
      })
      await page.goto('/saved')
      await expectTheaterReady(page)
      await expect(page.getByRole('button', { name: 'Play once' })).toBeVisible()
      await expect(caption(page, POST.alpha.text)).toBeVisible()

      const start = await readQueueProgress(page)
      expect(start.played).toBe(1)
      expect(start.toPlay).toBeGreaterThan(1)

      await page.getByRole('button', { name: 'Archive' }).click()
      await expect(caption(page, POST.bravo.text)).toBeVisible()
      await expect(visibleQueueCount(page)).toHaveText(`1 of ${start.toPlay - 1}`)

      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(caption(page, POST.alpha.text)).toBeVisible()
      await expect(visibleQueueCount(page)).toHaveText(`1 of ${start.toPlay}`)
    },
  )

  authedTest(
    'Play once Archive mid-list keeps the 1-based position on a shorter pile',
    async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('adhx-theater-repeat-saved', 'off')
      })
      await page.goto('/saved')
      await expectTheaterReady(page)
      await goNext(page)
      await expect(caption(page, POST.bravo.text)).toBeVisible()
      const start = await readQueueProgress(page)
      expect(start.played).toBe(2)

      await page.getByRole('button', { name: 'Archive' }).click()
      await expect(caption(page, POST.charlie.text)).toBeVisible()
      await expect(visibleQueueCount(page)).toHaveText(`2 of ${start.toPlay - 1}`)

      await page.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(caption(page, POST.bravo.text)).toBeVisible()
      await expect(visibleQueueCount(page)).toHaveText(`2 of ${start.toPlay}`)
    },
  )

  authedTest('Keep playing Archive names the shorter pile', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('adhx-theater-repeat-saved')
    })
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    const start = await visibleQueueCount(page).innerText()
    const startN = Number(start.match(/(\d+) on repeat/)?.[1])
    expect(startN).toBeGreaterThan(1)

    await page.getByRole('button', { name: 'Archive' }).click()
    await expect(caption(page, POST.bravo.text)).toBeVisible()
    await expect(visibleQueueCount(page)).toHaveText(`${startN - 1} on repeat`)

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(caption(page, POST.alpha.text)).toBeVisible()
    await expect(visibleQueueCount(page)).toHaveText(`${startN} on repeat`)
  })
})
