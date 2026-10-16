import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { PREVIEW_TT } from './constants'
import { expectTheaterReady } from './helpers'

/** A 4s VP8/Opus clip with a tone, so the stage's real <video> has audio to mute. */
const SOUND_CLIP = readFileSync(new URL('./fixtures/sound.webm', import.meta.url))

/** Serve the TikTok preview's stream from the local clip instead of the CDN. */
async function stubTikTokVideo(page: Page) {
  await page.route('**/api/media/tiktok/video?**', (route) =>
    route.fulfill({ status: 200, contentType: 'video/webm', body: SOUND_CLIP }),
  )
}

const TIKTOK_PREVIEW = `/@${PREVIEW_TT.author}/video/${PREVIEW_TT.id}`

test('desktop M restores a persisted sound choice after media falls back to muted', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => localStorage.setItem('adhx-theater-sound', 'on'))
  await stubTikTokVideo(page)
  await page.goto(TIKTOK_PREVIEW)
  await expectTheaterReady(page)
  await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible()

  // Model a browser rejecting gesture-less audible playback while retaining
  // the viewer's explicit browser-wide preference.
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('theater-set-muted', {
        detail: { muted: true, source: 'catchup' },
      }),
    )
  })
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('adhx-theater-sound'))).toBe('on')

  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('adhx-theater-sound'))).toBe('on')
})

test('the last sound choice follows links and synchronizes mobile and desktop tabs', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000)

  await page.setViewportSize({ width: 390, height: 844 })
  await stubTikTokVideo(page)
  await page.goto(TIKTOK_PREVIEW)
  await expectTheaterReady(page)

  // The muted affordance intentionally pulses, so Playwright never considers
  // its box "stable" even though it is visible and tappable.
  await page.getByRole('button', { name: 'Unmute' }).click({ force: true })
  await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('adhx-theater-sound')))
    .toBe('on')

  // A separately opened link gets the same localStorage preference even
  // though it has its own TheaterShell and media player.
  const desktopPage = await context.newPage()
  await stubTikTokVideo(desktopPage)
  await desktopPage.goto(TIKTOK_PREVIEW)
  await expectTheaterReady(desktopPage)
  await expect(desktopPage.getByRole('button', { name: 'Mute' })).toBeVisible()

  // Changing the desktop tab updates storage and the already-open mobile tab.
  await desktopPage.getByRole('button', { name: 'Mute' }).click({ force: true })
  await expect
    .poll(() => desktopPage.evaluate(() => localStorage.getItem('adhx-theater-sound')))
    .toBe('off')
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible()

  // The next mobile choice synchronizes back in the other direction.
  await page.getByRole('button', { name: 'Unmute' }).click({ force: true })
  await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible()
  await expect
    .poll(() => desktopPage.evaluate(() => localStorage.getItem('adhx-theater-sound')))
    .toBe('on')
})
