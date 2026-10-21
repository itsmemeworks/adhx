import { expect, test } from '@playwright/test'
import { POST } from './constants'
import { expectPreviewReady } from './helpers'

test.describe('mobile WebKit viewport', () => {
  test('keeps the caption, post actions, playback controls and tabs on screen', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.goto(`/${POST.quoted.author}/status/${POST.quoted.id}`)
    await expectPreviewReady(page)

    const height = await page.evaluate(() => window.innerHeight)
    const width = await page.evaluate(() => window.innerWidth)
    const rail = page.getByRole('navigation', { name: 'Post actions' })
    const tabs = page.getByRole('navigation', { name: 'Main' }).last()
    const transport = page.getByRole('button', { name: /^(Play|Pause)$/ }).locator('visible=true')
    const caption = page.getByText(POST.quoted.text, { exact: true }).locator('visible=true')

    for (const [label, locator] of [
      ['post actions', rail],
      ['tab bar', tabs],
      ['play/pause', transport.first()],
      ['caption', caption.first()],
    ] as const) {
      const box = await locator.boundingBox()
      expect(box, `${label} is laid out`).not.toBeNull()
      expect(box!.y, `${label} starts on screen`).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height, `${label} ends on screen`).toBeLessThanOrEqual(height + 1)
      expect(box!.x + box!.width, `${label} fits the width`).toBeLessThanOrEqual(width + 1)
    }

    // The playback controls sit above the tab bar, never under it.
    const [tabsBox, playBox] = await Promise.all([
      tabs.boundingBox(),
      transport.first().boundingBox(),
    ])
    expect(playBox!.y + playBox!.height).toBeLessThanOrEqual(tabsBox!.y + 1)
    // No sideways scrolling on a phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width + 1,
    )
  })
})
