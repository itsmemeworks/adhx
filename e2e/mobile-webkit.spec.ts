import { expect, test } from '@playwright/test'
import { POST } from './constants'
import { expectTheaterReady } from './helpers'

test.describe('mobile WebKit viewport', () => {
  test('keeps media caption and every bottom control on the visual viewport', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/${POST.quoted.author}/status/${POST.quoted.id}`)
    await expectTheaterReady(page)

    const shell = page.locator('.theater-shell-viewport').filter({ visible: true }).last()
    const top = shell.locator('.theater-mobile-top-chrome')
    const dock = shell.getByTestId('mobile-theater-dock')
    const scrim = shell.getByTestId('mobile-bottom-scrim')
    const actions = shell.getByTestId('mobile-control-actions')
    const zone = shell.getByTestId('mobile-swipe-zone')
    const capsule = zone.locator('[data-theater-swipe-control]')
    const caption = scrim.getByText(POST.quoted.text, { exact: true })
    const slider = shell.locator('[data-theater-progress-slider]')

    await expect(dock).toHaveCSS('position', 'fixed')
    await expect(scrim).toHaveCSS('position', 'fixed')
    await expect(zone).toHaveCSS('position', 'fixed')
    await expect(caption).toBeVisible()

    const viewportHeight = await shell.evaluate((shellElement) => {
      const topElement = shellElement.querySelector<HTMLElement>('.theater-mobile-top-chrome')
      if (!topElement) throw new Error('Theater viewport chrome did not mount')
      // Playwright's desktop WebKit build does not expose iOS-only
      // `-webkit-touch-callout`, even with an iPhone descriptor. Reproduce the
      // exact declarations from that guarded branch while retaining WebKit's
      // layout, stacking, and hit-testing engine.
      shellElement.style.position = 'absolute'
      shellElement.style.bottom = 'auto'
      shellElement.style.height = `${window.innerHeight + 180}px`
      topElement.style.position = 'fixed'
      return window.innerHeight
    })
    await expect(shell).toHaveCSS('position', 'absolute')
    await expect(top).toHaveCSS('position', 'fixed')
    const [dockBox, scrimBox, captionBox, capsuleBox, sliderBox] = await Promise.all([
      dock.boundingBox(),
      scrim.boundingBox(),
      caption.boundingBox(),
      capsule.boundingBox(),
      slider.boundingBox(),
    ])
    expect(dockBox).not.toBeNull()
    expect(scrimBox).not.toBeNull()
    expect(captionBox).not.toBeNull()
    expect(capsuleBox).not.toBeNull()
    expect(sliderBox).not.toBeNull()
    expect(scrimBox!.y + scrimBox!.height).toBeCloseTo(viewportHeight, 0)
    expect(captionBox!.y + captionBox!.height).toBeLessThanOrEqual(dockBox!.y)
    expect(captionBox!.y + captionBox!.height).toBeLessThan(sliderBox!.y)
    expect(capsuleBox!.y + capsuleBox!.height).toBeLessThanOrEqual(dockBox!.y)

    const lowestActionPoint = await actions.locator(':scope > *').evaluateAll((railActions) =>
      railActions.reduce(
        (lowest, action) => {
          const style = getComputedStyle(action)
          if (style.display === 'none' || style.visibility === 'hidden') return lowest
          const rect = action.getBoundingClientRect()
          return rect.bottom > lowest.bottom
            ? { bottom: rect.bottom, x: rect.left + rect.width / 2, y: rect.bottom - 2 }
            : lowest
        },
        { bottom: 0, x: 0, y: 0 },
      ),
    )
    expect(lowestActionPoint.bottom).toBeGreaterThan(0)
    expect(
      await actions.evaluate((rail, { x, y }) => {
        const hit = document.elementFromPoint(x, y)
        return !!hit && rail.contains(hit)
      }, lowestActionPoint),
    ).toBe(true)

    await caption.click()
    await expect(page.getByRole('button', { name: 'Watch' })).toBeVisible()
  })
})
