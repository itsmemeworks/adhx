import { expect, test } from '@playwright/test'
import { POST } from './constants'
import { authedTest, expectTheaterReady } from './helpers'

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('signed-out Live theater is usable at phone width', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Next post' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous post' })).toBeVisible()
  })

  test('iOS Chrome geometry keeps the dock visible and moves scrubbing away from the top edge', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(
      page.locator('.theater-mobile-top-chrome [data-theater-action="menu"]'),
    ).toBeVisible()

    // Chromium does not match the iOS-only `-webkit-touch-callout` query.
    // Reproduce Chrome iOS's failure geometry: the large media paint layer is
    // taller than the visible viewport while document scroll stays locked at
    // zero. An absolute dock disappears below view here; a visual-viewport
    // fixed dock remains reachable.
    const initialHeight = await page.evaluate(() => window.innerHeight)
    await page.evaluate((height) => {
      const shell = document.querySelector<HTMLElement>('.theater-shell-viewport')
      const top = document.querySelector<HTMLElement>('.theater-mobile-top-chrome')
      if (!shell || !top) throw new Error('Theater viewport chrome did not mount')
      shell.style.position = 'absolute'
      shell.style.bottom = 'auto'
      shell.style.height = `${height + 180}px`
      top.style.position = 'fixed'
      window.scrollTo(0, 0)
    }, initialHeight)

    const lockedAt = await page.evaluate(() => window.scrollY)
    await page.mouse.move(20, Math.floor(initialHeight / 2))
    await page.mouse.wheel(0, 400)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(lockedAt)

    const dock = page.getByTestId('mobile-theater-dock')
    const queue = page.locator('[data-theater-action="show-all"]:visible')
    await expect(dock).toHaveCSS('position', 'fixed')
    await expect(dock).toHaveCSS('border-radius', '0px')
    await expect(dock).toHaveCSS('border-top-width', '0px')
    await expect(dock).toHaveCSS('background-color', 'rgba(18, 17, 23, 0.85)')
    await expect(queue).toBeInViewport()
    await expect(page.locator('[data-theater-sheet-handle]')).toHaveCount(0)
    const playbackLabels = await page
      .getByTestId('mobile-playback-controls')
      .locator(':scope > button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
    expect(playbackLabels[0]).toBe('Hide controls')
    expect(playbackLabels.at(-1)).toMatch(/^(Mute|Unmute)$/)

    // The progress rail is the dock's straight top edge. Its larger invisible
    // hit target sits immediately above that edge—not at the screen top, where
    // Chrome owns the native tab-switch gesture.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('theater-pause')))
    const slider = page.locator('[data-theater-progress-slider]')
    const track = page.locator('[data-theater-progress-track]')
    await expect(track).toBeVisible()
    await expect(track).toHaveCSS('height', '4px')
    const sliderBox = await slider.boundingBox()
    const trackBox = await track.boundingBox()
    const dockBox = await dock.boundingBox()
    expect(sliderBox).not.toBeNull()
    expect(trackBox).not.toBeNull()
    expect(dockBox).not.toBeNull()
    expect(sliderBox?.y ?? 0).toBeGreaterThan(initialHeight / 2)
    expect(Math.abs((trackBox?.y ?? 0) - (dockBox?.y ?? Number.MAX_VALUE))).toBeLessThanOrEqual(2)
    const scrubY = (trackBox?.y ?? 0) + (trackBox?.height ?? 0) / 2
    expect(scrubY).toBeGreaterThanOrEqual(sliderBox?.y ?? Number.MAX_VALUE)
    expect(scrubY).toBeLessThanOrEqual(
      (sliderBox?.y ?? 0) + (sliderBox?.height ?? Number.MIN_SAFE_INTEGER),
    )
    expect(
      await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.hasAttribute('data-theater-progress-slider') ?? false,
        { x: 195, y: 2 },
      ),
    ).toBe(false)

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

    // The Playlist button is the only touch toggle now; the former drag strip
    // is gone so it cannot compete with horizontal scrubbing on this edge.
    // Hide only Next's dev-only portal, then use a real touch tap and verify
    // the browser's hit target before both open and close interactions.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    const queueCenter = async () => {
      const box = await queue.boundingBox()
      expect(box).not.toBeNull()
      return {
        x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
        y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
      }
    }
    const queueHitTarget = async () => {
      const center = await queueCenter()
      return page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest('[data-theater-action="show-all"]')
            ?.getAttribute('data-theater-action') ?? null,
        center,
      )
    }
    await expect.poll(queueHitTarget).toBe('show-all')
    await queue.tap()
    await expect(queue).toHaveAttribute('aria-expanded', 'true')
    await expect
      .poll(async () => {
        const box = await dock.boundingBox()
        const viewportHeight = await page.evaluate(() => window.innerHeight)
        return box ? Math.abs(box.y - viewportHeight * 0.3) <= 1 : false
      })
      .toBe(true)

    // Queue owns the expanded state. The vertical post-action rail is removed
    // from layout and interaction until the sheet has fully collapsed again.
    const postActions = page.getByTestId('mobile-control-actions')
    await expect(postActions).toHaveAttribute('aria-hidden', 'true')
    await expect(postActions).toHaveAttribute('inert', '')
    await expect(postActions).toHaveCSS('display', 'none')

    await expect.poll(queueHitTarget).toBe('show-all')
    await queue.tap()
    await expect(queue).toHaveAttribute('aria-expanded', 'false')
    await expect(postActions).toHaveAttribute('aria-hidden', 'false')
    await expect(postActions).not.toHaveAttribute('inert')
    await expect(postActions).toHaveCSS('display', 'flex')
    await expect(postActions).toHaveClass(/flex-col/)

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

  test('short landscape Queue hides post actions and leaves top chrome clear', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto('/')
    await expectTheaterReady(page)
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

    const dock = page.getByTestId('mobile-theater-dock')
    const queue = page.locator('[data-theater-action="show-all"]:visible')
    await queue.tap()
    await expect(queue).toHaveAttribute('aria-expanded', 'true')
    await expect
      .poll(async () => {
        const box = await dock.boundingBox()
        const viewportHeight = await page.evaluate(() => window.innerHeight)
        return box ? Math.abs(box.y - viewportHeight * 0.3) <= 1 : false
      })
      .toBe(true)

    const postActions = page.getByTestId('mobile-control-actions')
    await expect(postActions).toHaveAttribute('aria-hidden', 'true')
    await expect(postActions).toHaveAttribute('inert', '')
    await expect(postActions).toHaveCSS('display', 'none')
    await expect(page.getByRole('button', { name: 'Paste a link' })).toBeInViewport()
    await expect(
      page.locator('.theater-mobile-top-chrome [data-theater-action="menu"]'),
    ).toBeInViewport()

    await queue.tap()
    await expect(queue).toHaveAttribute('aria-expanded', 'false')
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

authedTest.describe('mobile personal controls', () => {
  authedTest.use({ viewport: { width: 844, height: 390 }, hasTouch: true })

  authedTest(
    'short landscape keeps four vertical actions clear and Q preserves focus',
    async ({ page }) => {
      authedTest.setTimeout(90_000)
      await page.goto('/saved')
      await expectTheaterReady(page)
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

      const postActions = page.getByTestId('mobile-control-actions')
      const paste = page.getByRole('button', { name: 'Paste a link' })
      const account = page.getByRole('button', { name: 'Account menu' })
      const swipe = page.locator('[data-theater-swipe-control]')
      const slider = page.locator('[data-theater-progress-slider]')
      await expect(postActions).toHaveCSS('flex-direction', 'column')
      await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Tag' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open on X' })).toBeVisible()

      const [actionsBox, pasteBox, accountBox, swipeBox, sliderBox] = await Promise.all([
        postActions.boundingBox(),
        paste.boundingBox(),
        account.boundingBox(),
        swipe.boundingBox(),
        slider.boundingBox(),
      ])
      expect(actionsBox).not.toBeNull()
      expect(pasteBox).not.toBeNull()
      expect(accountBox).not.toBeNull()
      expect(swipeBox).not.toBeNull()
      expect(sliderBox).not.toBeNull()
      expect(actionsBox!.x + actionsBox!.width).toBeLessThan(pasteBox!.x)
      expect(actionsBox!.x + actionsBox!.width).toBeLessThan(accountBox!.x)
      expect(actionsBox!.x + actionsBox!.width).toBeLessThan(swipeBox!.x)
      expect(actionsBox!.y + actionsBox!.height).toBeLessThan(sliderBox!.y)

      const queue = page.locator('[data-theater-action="show-all"]:visible')
      await page.getByRole('button', { name: 'Share' }).focus()
      await page.keyboard.press('q')
      await expect(queue).toHaveAttribute('aria-expanded', 'true')
      await expect(queue).toBeFocused()
      await expect(postActions).toHaveCSS('display', 'none')
    },
  )

  authedTest(
    'compact landscape keeps every personal action inside the viewport',
    async ({ page }) => {
      authedTest.setTimeout(90_000)
      await page.setViewportSize({ width: 568, height: 320 })
      await page.goto('/saved')
      await expectTheaterReady(page)
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

      const postActions = page.getByTestId('mobile-control-actions')
      const paste = page.getByRole('button', { name: 'Paste a link' })
      const swipe = page.locator('[data-theater-swipe-control]')
      const dock = page.getByTestId('mobile-theater-dock')
      const slider = page.locator('[data-theater-progress-slider]')
      await expect(postActions).toHaveCSS('flex-direction', 'column')
      await expect(page.getByRole('link', { name: 'Open on X' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()

      const [actionsBox, pasteBox, swipeBox, dockBox, sliderBox] = await Promise.all([
        postActions.boundingBox(),
        paste.boundingBox(),
        swipe.boundingBox(),
        dock.boundingBox(),
        slider.boundingBox(),
      ])
      expect(actionsBox).not.toBeNull()
      expect(pasteBox).not.toBeNull()
      expect(swipeBox).not.toBeNull()
      expect(dockBox).not.toBeNull()
      expect(sliderBox).not.toBeNull()
      expect(actionsBox!.y).toBeGreaterThanOrEqual(0)
      expect(actionsBox!.y + actionsBox!.height).toBeLessThan(dockBox!.y)
      expect(actionsBox!.y + actionsBox!.height).toBeLessThan(sliderBox!.y)
      expect(actionsBox!.x + actionsBox!.width).toBeLessThan(pasteBox!.x)
      expect(actionsBox!.x + actionsBox!.width).toBeLessThan(swipeBox!.x)
    },
  )
})
