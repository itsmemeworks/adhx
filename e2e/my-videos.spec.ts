import { expect } from '@playwright/test'
import { POST } from './constants'
import { authedTest, expectTheaterReady, openTheaterQueue, visibleCaption } from './helpers'

for (const mobile of [false, true]) {
  authedTest(
    `${mobile ? 'mobile' : 'desktop'}: home shows my saves and watch filtering is reversible`,
    async ({ page }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 })
      await page.addInitScript((watched) => {
        localStorage.setItem('adhx-seen-v1', JSON.stringify([watched]))
        localStorage.setItem('adhx-theater-repeat-saved', 'off')
      }, `twitter:${POST.alpha.id}`)
      await page.goto('/')
      await expect(page).toHaveURL(/\/saved$/)
      await expectTheaterReady(page)
      if (mobile) await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
      await expect(visibleCaption(page, POST.alpha.text)).toBeVisible()
      const filter = page.getByRole('group', { name: 'Watch history' }).filter({ visible: true })
      const trigger = page.getByRole('button', {
        name: mobile ? 'Quick filter posts' : 'Filter posts',
        exact: true,
      })
      await expect(filter).toHaveCount(0)
      await trigger.click()
      await expect(filter.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await filter.getByRole('button', { name: 'Unwatched', exact: true }).click()
      await expect(visibleCaption(page, POST.bravo.text)).toBeVisible()
      await expect(trigger).toHaveAttribute('title', 'Unwatched')
      if ((await trigger.getAttribute('aria-expanded')) === 'true') {
        await page.keyboard.press('Escape')
      }
      if (mobile) await page.getByRole('button', { name: 'Expand up next' }).click()
      const queue = mobile ? page.getByTestId('mobile-sheet-content') : await openTheaterQueue(page)
      await expect(queue.getByText(POST.alpha.text, { exact: true })).toHaveCount(0)
      if (mobile) await page.getByRole('button', { name: 'Collapse up next' }).click()
      else await page.keyboard.press('Escape')
      await trigger.click()
      await filter.getByRole('button', { name: 'All', exact: true }).click()
      await expect(visibleCaption(page, POST.alpha.text)).toBeVisible()
      await expect(trigger).toHaveAttribute('title', 'Filter posts')
      await page.reload()
      await expectTheaterReady(page)
      await expect(filter).toHaveCount(0)
      await trigger.click()
      await expect(filter.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(visibleCaption(page, POST.alpha.text)).toBeVisible()
      await page.screenshot({
        path: `/tmp/adhx-watch-filter-${mobile ? 'mobile' : 'desktop'}-open.png`,
      })
      await page.keyboard.press('Escape')
      await expect(filter).toHaveCount(0)
      await page.screenshot({
        path: `/tmp/adhx-watch-filter-${mobile ? 'mobile' : 'desktop'}-closed.png`,
      })
    },
  )
}
