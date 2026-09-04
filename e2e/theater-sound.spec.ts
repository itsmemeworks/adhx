import { expect, test } from '@playwright/test'
import { PREVIEW_YT } from './constants'
import { expectTheaterReady } from './helpers'
import { stubYouTubeEmbed } from './yt-embed-stub'

test('the last sound choice follows links and synchronizes mobile and desktop tabs', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000)

  await page.setViewportSize({ width: 390, height: 844 })
  await stubYouTubeEmbed(page)
  await page.goto(`/shorts/${PREVIEW_YT.id}`)
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
  await stubYouTubeEmbed(desktopPage, 20, { rejectSecondUnmute: true })
  await desktopPage.goto(`/shorts/${PREVIEW_YT.id}`)
  await expectTheaterReady(desktopPage)
  await expect(desktopPage.getByRole('button', { name: 'Mute' })).toBeVisible()

  // Changing the desktop tab updates storage and the already-open mobile tab.
  await desktopPage.getByRole('button', { name: 'Mute' }).click({ force: true })
  await expect
    .poll(() => desktopPage.evaluate(() => localStorage.getItem('adhx-theater-sound')))
    .toBe('off')
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible()

  // The next mobile choice synchronizes back in the other direction. This
  // desktop embed accepts that gesture-less unmute, then emits iOS's observed
  // policy shape (confirmation followed by pause); ADHX must recover to muted
  // playback without forgetting that the viewer still prefers sound.
  await page.getByRole('button', { name: 'Unmute' }).click({ force: true })
  await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible()
  await expect(desktopPage.getByRole('button', { name: 'Unmute' })).toBeVisible()
  expect(await desktopPage.evaluate(() => localStorage.getItem('adhx-theater-sound'))).toBe('on')
})
