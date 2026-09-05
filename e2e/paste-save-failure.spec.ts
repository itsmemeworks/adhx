import { expect } from '@playwright/test'
import { authedTest, caption, expectTheaterReady, pasteTheaterLink } from './helpers'

const reelUrl = 'https://www.instagram.com/reel/Dc5ATuiiS0V/?igsi=dm9jdTR5cTN0dDg4'

for (const mobile of [false, true]) {
  for (const tab of ['live', 'saved']) {
    authedTest(
      `${mobile ? 'mobile' : 'desktop'} ${tab}: a failed save still opens the pasted Reel`,
      async ({ page }) => {
        if (mobile) {
          await page.setViewportSize({ width: 390, height: 844 })
          await page.addInitScript(() => {
            Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
          })
        }
        await page.route('**/api/bookmarks/add', (route) =>
          route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Instagram post not available' }),
          }),
        )
        await page.goto(`/${tab}`)
        await expectTheaterReady(page)
        if (mobile) {
          await page.getByRole('button', { name: 'Paste a link', exact: true }).click()
          const input = page.getByPlaceholder('Paste a link…')
          await input.fill(reelUrl)
          await input.press('Enter')
        } else {
          await pasteTheaterLink(page, reelUrl)
        }
        await expect(page).toHaveURL(/\/reels\/Dc5ATuiiS0V$/)
        await expectTheaterReady(page)
        await expect(caption(page, 'E2E reel Dc5ATuiiS0V')).toBeVisible()
      },
    )
  }
}
