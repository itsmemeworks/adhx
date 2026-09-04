import { expect, test } from '@playwright/test'
import { POST } from './constants'
import { expectTheaterReady } from './helpers'

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('signed-out Live theater is usable at phone width', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Next post' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous post' })).toBeVisible()
  })

  test('iOS viewport shell keeps the document locked and top controls tappable', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(
      page.locator('.theater-mobile-top-chrome [data-theater-action="menu"]'),
    ).toBeVisible()

    // Chromium does not match the iOS-only `-webkit-touch-callout` feature
    // query. Apply only its positioning result here; z-index and document
    // locking still come from production code, so this catches the fixed
    // stacking-context regression where the invisible z-70 scrubber stole
    // Paste/menu taps.
    const initialHeight = await page.evaluate(() => window.innerHeight)
    await page.evaluate((height) => {
      const shell = document.querySelector<HTMLElement>('.theater-shell-viewport')
      const top = document.querySelector<HTMLElement>('.theater-mobile-top-chrome')
      if (!shell || !top) throw new Error('Theater viewport chrome did not mount')
      shell.style.position = 'absolute'
      shell.style.bottom = 'auto'
      shell.style.height = `${height + 180}px`
      top.style.position = 'fixed'
      window.scrollTo(0, 180)
    }, initialHeight)

    const lockedAt = await page.evaluate(() => window.scrollY)
    await page.mouse.move(20, Math.floor(initialHeight / 2))
    await page.mouse.wheel(0, 400)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(lockedAt)

    // The fixed header is pointer-transparent between its control clusters,
    // so the full-width playback scrubber beneath it must still own the
    // centre of the top-edge hit area.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('theater-pause')))
    const slider = page.locator('[data-theater-progress-slider]')
    const sliderBox = await slider.boundingBox()
    expect(sliderBox).not.toBeNull()
    const scrubY = (sliderBox?.y ?? 0) + (sliderBox?.height ?? 0) / 2
    const scrubStartX = 140
    const scrubEndX = 250
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.hasAttribute('data-theater-progress-slider') ?? false,
        { x: (scrubStartX + scrubEndX) / 2, y: scrubY },
      ),
    ).toBe(true)
    const beforeScrub = await slider.inputValue()
    await page.mouse.move(scrubStartX, scrubY)
    await page.mouse.down()
    await page.mouse.move(scrubEndX, scrubY, { steps: 4 })
    await page.mouse.up()
    await expect.poll(() => slider.inputValue()).not.toBe(beforeScrub)

    const menu = page.locator('.theater-mobile-top-chrome [data-theater-action="menu"]')
    await expect(menu).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Paste a link' })).toBeInViewport()
    await menu.click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')

    const menuBox = await menu.boundingBox()
    expect(menuBox).not.toBeNull()
    await page.getByRole('button', { name: 'Hide controls' }).click()
    await expect(page.locator('.theater-mobile-top-chrome')).toHaveAttribute('inert', '')
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest('[data-theater-action="menu"]')
            ?.getAttribute('data-theater-action') ?? null,
        {
          x: (menuBox?.x ?? 0) + (menuBox?.width ?? 0) / 2,
          y: (menuBox?.y ?? 0) + (menuBox?.height ?? 0) / 2,
        },
      ),
    ).toBeNull()

    await page.getByRole('button', { name: 'Show controls' }).click()
    await page.getByRole('button', { name: 'Paste a link' }).click()
  })

  test('tweet preview pin still holds on a phone', async ({ page }) => {
    test.setTimeout(90_000)
    const previewPath = `/${POST.preview.author}/status/${POST.preview.id}`
    await page.goto(previewPath)
    await expectTheaterReady(page)
    await expect(page.getByText(POST.preview.text).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()
  })
})
