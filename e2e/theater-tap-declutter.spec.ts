import { expect, test } from '@playwright/test'
import { POST } from './constants'
import { expectTheaterReady, readToggle } from './helpers'

const quotedPath = `/${POST.quoted.author}/status/${POST.quoted.id}`

async function tapStageVideo(page: import('@playwright/test').Page) {
  const video = page.locator('[data-testid="theater-stage"] video')
  await expect(video).toBeAttached({ timeout: 30_000 })
  await video.click({ force: true })
}

test.describe('tap video to declutter, not pause', () => {
  test('desktop: first tap hides chrome, second tap restores, video stays up', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(quotedPath)
    await expectTheaterReady(page)

    await expect(page.getByRole('button', { name: 'Paste a link' })).toBeVisible()
    await expect(readToggle(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide controls' })).toBeVisible()

    await tapStageVideo(page)

    // Dock stays in the tree at h-0, so Hide is not "hidden" to Playwright.
    // The floating restore button is the desktop declutter signal.
    await expect(page.getByRole('button', { name: 'Show controls' })).toBeVisible()
    await expect(page.locator('[data-testid="theater-stage"] video')).toBeAttached()

    await tapStageVideo(page)

    await expect(page.getByRole('button', { name: 'Paste a link' })).toBeVisible()
    await expect(readToggle(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show controls' })).toHaveCount(0)
  })
})

test.describe('tap video to declutter on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('mobile: first tap hides overlays, second tap restores', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(quotedPath)
    await expectTheaterReady(page)

    await expect(page.getByRole('button', { name: 'Paste a link' })).toBeVisible()
    await expect(readToggle(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide controls' })).toBeVisible()

    await tapStageVideo(page)

    await expect(page.getByRole('button', { name: 'Show controls' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide controls' })).toHaveCount(0)
    await expect(page.locator('[data-testid="theater-stage"] video')).toBeAttached()

    await tapStageVideo(page)

    await expect(page.getByRole('button', { name: 'Paste a link' })).toBeVisible()
    await expect(readToggle(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide controls' })).toBeVisible()
  })
})
