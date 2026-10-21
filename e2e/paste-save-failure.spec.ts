import { expect } from '@playwright/test'
import { authedTest, expectOriginalWords, expectPreviewReady } from './helpers'

const reelUrl = 'https://www.instagram.com/reel/Dc5ATuiiS0V/?igsi=dm9jdTR5cTN0dDg4'

for (const mobile of [false, true]) {
  authedTest(
    `${mobile ? 'mobile' : 'desktop'}: a failed save still lets you watch the pasted Reel`,
    async ({ page }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 })
      // No clipboard access: Paste opens a box to paste into.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
      })
      await page.route('**/api/bookmarks/add', (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Instagram post not available' }),
        }),
      )
      await page.goto('/now')
      const paste = page.getByRole('button', { name: 'Paste', exact: true })
      if (mobile) {
        await paste.click()
      } else {
        // Desktop pastes with ⌘V; the pill is there for keyboards, shown once focused.
        await paste.focus()
        expect((await paste.boundingBox())?.width ?? 0).toBeGreaterThan(20)
        await page.keyboard.press('Enter')
      }
      const input = page.getByPlaceholder(/Paste a (post )?link/)
      await input.fill(reelUrl)
      await input.press('Enter')
      await expect(page.getByText('Couldn’t save it: Instagram post not available')).toBeVisible()
      await page.getByRole('button', { name: 'Watch it anyway' }).click()
      await expect(page).toHaveURL(/\/reels\/Dc5ATuiiS0V$/)
      await expectPreviewReady(page)
      await expectOriginalWords(page, 'E2E reel Dc5ATuiiS0V')
    },
  )
}
