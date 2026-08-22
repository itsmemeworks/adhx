import { expect, test } from '@playwright/test'
import { PREVIEW_IG, PREVIEW_TT, PREVIEW_YT } from './constants'
import { caption, expectTheaterReady } from './helpers'

test.describe('preview pages for every platform', () => {
  test('Instagram reel preview mounts the theater', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/reels/${PREVIEW_IG.id}`)
    await expectTheaterReady(page)
    await expect(caption(page, PREVIEW_IG.text)).toBeVisible()
  })

  test('TikTok preview mounts the theater', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/@${PREVIEW_TT.author}/video/${PREVIEW_TT.id}`)
    await expectTheaterReady(page)
    await expect(caption(page, PREVIEW_TT.text)).toBeVisible()
  })

  test('YouTube Shorts preview mounts the theater', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/shorts/${PREVIEW_YT.id}`)
    await expectTheaterReady(page)
    await expect(caption(page, PREVIEW_YT.text)).toBeVisible()
  })
})
