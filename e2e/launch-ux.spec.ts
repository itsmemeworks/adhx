import { test, expect, type Page } from '@playwright/test'
import { ADD_VIDEO } from './constants'
import { deleteLivePulse, expectTheaterReady, insertLivePulse, pauseTheater } from './helpers'

async function freshVisitor(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('launch-test-started')) return
    localStorage.clear()
    sessionStorage.setItem('launch-test-started', '1')
  })
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 844, height: 390 },
]) {
  test(`new visitor: clear filters and actions at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await freshVisitor(page)
    insertLivePulse({ ...ADD_VIDEO, contentType: 'video' })
    try {
      await page.goto('/')
      await expectTheaterReady(page)
      await pauseTheater(page)
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
      const filter = page.getByRole('button', {
        name: viewport.width >= 1024 ? 'Filter posts' : 'Quick filter posts',
        exact: true,
      })
      await expect(filter).toContainText('Videos')
      await expect(page.getByRole('complementary', { name: 'Getting started' })).toBeVisible()
      const paste = page.getByRole('button', { name: /Paste (a )?link$/, exact: true })
      await expect(paste).toContainText('Paste link')
      await filter.click()
      const hide = page.getByRole('switch', { name: 'Hide watched' }).filter({ visible: true })
      await expect(hide).toHaveAttribute('aria-checked', 'true')
      await hide.click()
      const all = page
        .getByRole('button', { name: viewport.width >= 1024 ? 'All post types' : /^All posts,/ })
        .filter({ visible: true })
      await all.click()
      await page.keyboard.press('Escape')
      await expect(filter).toContainText('All posts')
      await page.getByRole('button', { name: 'Dismiss getting started' }).click()
      await page.goto('/')
      await expectTheaterReady(page)
      await pauseTheater(page)
      await expect(filter).toContainText('All posts')
      await expect(page.getByRole('complementary', { name: 'Getting started' })).toHaveCount(0)
      await filter.click()
      await expect(hide).toHaveAttribute('aria-checked', 'false')
      await page.screenshot({
        path: `/tmp/adhx-launch-${viewport.width}-${viewport.height}-filters.png`,
      })
      await page.keyboard.press('Escape')
      const buttons = [filter, paste, page.getByRole('button', { name: 'Next post' })]
      for (const button of buttons) {
        const box = await button.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: `/tmp/adhx-launch-${viewport.width}-${viewport.height}-closed.png`,
      })
    } finally {
      deleteLivePulse([ADD_VIDEO.id])
    }
  })
}
