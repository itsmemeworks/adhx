import { expect, test } from '@playwright/test'
import { PREVIEW_YT } from './constants'
import { caption, expectTheaterReady } from './helpers'
import { progressFillPercent, stubYouTubeEmbed } from './yt-embed-stub'

test.describe('YouTube clay progress bar', () => {
  test('fills on autoplay without a click inside the iframe', async ({ page }) => {
    test.setTimeout(90_000)
    await stubYouTubeEmbed(page, 20)
    await page.goto(`/shorts/${PREVIEW_YT.id}`)
    await expectTheaterReady(page)
    await expect(caption(page, PREVIEW_YT.text)).toBeVisible()

    await expect.poll(async () => progressFillPercent(page), { timeout: 8_000 }).toBeGreaterThan(4)
    const first = await progressFillPercent(page)
    await page.waitForTimeout(1_500)
    expect(await progressFillPercent(page)).toBeGreaterThan(first)
  })

  test('pause freezes the bar; a click in the frame snaps to real time', async ({ page }) => {
    test.setTimeout(90_000)
    await stubYouTubeEmbed(page, 20)
    await page.goto(`/shorts/${PREVIEW_YT.id}`)
    await expectTheaterReady(page)

    await expect.poll(async () => progressFillPercent(page), { timeout: 8_000 }).toBeGreaterThan(3)
    await page.getByRole('button', { name: 'Pause' }).click()
    const pausedAt = await progressFillPercent(page)
    await page.waitForTimeout(1_500)
    expect(Math.abs((await progressFillPercent(page)) - pausedAt)).toBeLessThan(2)

    const ytFrame = page.frames().find((f) => f.url().includes('youtube-nocookie.com'))
    if (!ytFrame) throw new Error('youtube-nocookie iframe never loaded')
    await ytFrame.evaluate(() => {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await expect.poll(async () => progressFillPercent(page), { timeout: 5_000 }).toBeGreaterThan(70)
  })
})

test.describe('YouTube clay progress bar (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('fills on autoplay at phone width without an in-frame tap', async ({ page }) => {
    test.setTimeout(90_000)
    await stubYouTubeEmbed(page, 20)
    await page.goto(`/shorts/${PREVIEW_YT.id}`)
    await expectTheaterReady(page)
    await expect.poll(async () => progressFillPercent(page), { timeout: 8_000 }).toBeGreaterThan(4)
  })
})
