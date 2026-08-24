import { expect, test } from '@playwright/test'
import { deleteLivePulse, expectTheaterReady, insertLivePulse } from './helpers'

const PULSE_TEXT_ID = '9000000000000000888'
const PULSE_VIDEO_ID = '9000000000000000889'

test.describe('Live type filter vs preview pulses', () => {
  test.beforeEach(() => {
    deleteLivePulse([PULSE_TEXT_ID, PULSE_VIDEO_ID])
  })
  test.afterEach(() => {
    deleteLivePulse([PULSE_TEXT_ID, PULSE_VIDEO_ID])
  })

  test('a video preview joins a Videos queue; a text preview does not', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/')
    await expectTheaterReady(page)
    await page.evaluate(() => {
      localStorage.removeItem('adhx-theater-types')
      localStorage.removeItem('adhx-theater-visual')
    })
    // Do not reload — Live replaceStates the bar onto a preview path, and a
    // reload would remount shared mode (which keeps a text lead under Videos).
    await page.getByRole('button', { name: 'Show all', exact: true }).click()
    await page.getByRole('button', { name: 'Videos', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: 'Show all', exact: true })).toHaveText('Videos')
    await expect(page.getByText('No videos in Live right now')).toBeVisible()

    insertLivePulse({
      id: PULSE_TEXT_ID,
      author: 'e2epulsetext',
      authorName: 'E2E Pulse Text',
      text: 'E2E-PULSE-TEXT',
      contentType: 'text',
    })
    insertLivePulse({
      id: PULSE_VIDEO_ID,
      author: 'e2epulsevid',
      authorName: 'E2E Pulse Vid',
      text: 'E2E-PULSE-VIDEO',
      contentType: 'video',
      platform: 'tiktok',
      url: `/@e2epulsevid/video/${PULSE_VIDEO_ID}`,
    })

    // Server trending cache is 12s; the theater poll is another 12s.
    await expect(page.getByText('E2E-PULSE-VIDEO').first()).toBeVisible({ timeout: 40_000 })
    await expect(page.getByText('No videos in Live right now')).toHaveCount(0)
    await expect(page.getByText('E2E-PULSE-TEXT')).toHaveCount(0)

    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText('E2E-PULSE-TEXT').first()).toBeVisible()
  })
})
