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

  test('iOS Chrome geometry keeps every mobile control edge on the visual viewport', async ({
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
    const bottomScrim = page.getByTestId('mobile-bottom-scrim')
    const postActions = page.getByTestId('mobile-control-actions')
    const swipeZone = page.getByTestId('mobile-swipe-zone')
    const swipeControl = swipeZone.locator('[data-theater-swipe-control]')
    const queue = page.locator('[data-theater-action="show-all"]:visible')
    await expect(dock).toHaveCSS('position', 'fixed')
    await expect(bottomScrim).toHaveCSS('position', 'fixed')
    await expect(swipeZone).toHaveCSS('position', 'fixed')
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
    const bottomScrimBox = await bottomScrim.boundingBox()
    const captionBox = await bottomScrim.locator(':scope > div').first().boundingBox()
    const swipeControlBox = await swipeControl.boundingBox()
    const actionGeometry = await postActions.locator(':scope > *').evaluateAll((actions) =>
      actions.reduce(
        (geometry, action) => {
          const style = getComputedStyle(action)
          if (style.display === 'none' || style.visibility === 'hidden') return geometry
          const rect = action.getBoundingClientRect()
          return rect.bottom > geometry.bottom
            ? { bottom: rect.bottom, point: { x: rect.left + rect.width / 2, y: rect.bottom - 2 } }
            : geometry
        },
        { bottom: 0, point: { x: 0, y: 0 } },
      ),
    )
    expect(sliderBox).not.toBeNull()
    expect(trackBox).not.toBeNull()
    expect(dockBox).not.toBeNull()
    expect(bottomScrimBox).not.toBeNull()
    expect(captionBox).not.toBeNull()
    expect(swipeControlBox).not.toBeNull()
    expect(actionGeometry.bottom).toBeGreaterThan(0)
    expect(
      Math.abs((bottomScrimBox?.y ?? 0) + (bottomScrimBox?.height ?? 0) - initialHeight),
    ).toBeLessThanOrEqual(1)
    expect((captionBox?.y ?? 0) + (captionBox?.height ?? 0)).toBeLessThanOrEqual(dockBox?.y ?? 0)
    expect((swipeControlBox?.y ?? 0) + (swipeControlBox?.height ?? 0)).toBeLessThanOrEqual(
      dockBox?.y ?? 0,
    )
    const actionToSwipeGap = (swipeControlBox?.y ?? 0) - actionGeometry.bottom
    expect(actionToSwipeGap).toBeGreaterThanOrEqual(0)
    expect(actionToSwipeGap).toBeLessThanOrEqual(12)
    expect(
      await postActions.evaluate((rail, { x, y }) => {
        const hit = document.elementFromPoint(x, y)
        return !!hit && rail.contains(hit)
      }, actionGeometry.point),
    ).toBe(true)
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

  test('media caption stays above the dock when the paint layer is taller', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/${POST.quoted.author}/status/${POST.quoted.id}`)
    await expectTheaterReady(page)

    const theater = page.locator('.theater-shell-viewport').filter({ visible: true }).last()
    const scrim = theater.getByTestId('mobile-bottom-scrim')
    const caption = scrim.getByText(POST.quoted.text, { exact: true })
    const dock = theater.getByTestId('mobile-theater-dock')
    const slider = theater.locator('[data-theater-progress-slider]')
    await expect(caption).toBeVisible()
    const viewportHeight = await theater.evaluate((shell) => {
      shell.style.position = 'absolute'
      shell.style.bottom = 'auto'
      shell.style.height = `${window.innerHeight + 180}px`
      return window.innerHeight
    })

    const [scrimBox, captionBox, dockBox, sliderBox] = await Promise.all([
      scrim.boundingBox(),
      caption.boundingBox(),
      dock.boundingBox(),
      slider.boundingBox(),
    ])
    expect(scrimBox).not.toBeNull()
    expect(captionBox).not.toBeNull()
    expect(dockBox).not.toBeNull()
    expect(sliderBox).not.toBeNull()
    expect(captionBox!.height).toBeGreaterThan(0)
    expect(scrimBox!.y + scrimBox!.height).toBeCloseTo(viewportHeight, 0)
    expect(captionBox!.y + captionBox!.height).toBeLessThanOrEqual(dockBox!.y)
    expect(captionBox!.y + captionBox!.height).toBeLessThan(sliderBox!.y)
  })

  test('short landscape Queue hides post actions and leaves top chrome clear', async ({ page }) => {
    test.setTimeout(90_000)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { top: 0, left: 34, bottom: 0, right: 44 },
    })
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto('/')
    await expectTheaterReady(page)
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

    const dock = page.getByTestId('mobile-theater-dock')
    const swipeZone = page.getByTestId('mobile-swipe-zone')
    const scrim = page.getByTestId('mobile-bottom-scrim')
    const queue = page.locator('[data-theater-action="show-all"]:visible')
    const menu = page.locator('.theater-mobile-top-chrome [data-theater-action="menu"]')
    const home = page.locator('.theater-mobile-top-chrome a[aria-label="ADHX home"]')
    const playback = page.getByTestId('mobile-playback-controls')
    const viewportWidth = page.viewportSize()!.width
    const [swipeBox, actionsBox, queueBox, menuBox, homeBox, playbackBox] = await Promise.all([
      swipeZone.boundingBox(),
      page.getByTestId('mobile-control-actions').boundingBox(),
      queue.boundingBox(),
      menu.boundingBox(),
      home.boundingBox(),
      playback.boundingBox(),
    ])
    expect(swipeBox).not.toBeNull()
    expect(actionsBox).not.toBeNull()
    expect(queueBox).not.toBeNull()
    expect(menuBox).not.toBeNull()
    expect(homeBox).not.toBeNull()
    expect(playbackBox).not.toBeNull()
    expect(viewportWidth - (swipeBox!.x + swipeBox!.width)).toBeCloseTo(44, 0)
    expect(viewportWidth - (actionsBox!.x + actionsBox!.width)).toBeCloseTo(56, 0)
    expect(queueBox!.x).toBeCloseTo(34, 0)
    expect(homeBox!.x).toBeCloseTo(34, 0)
    expect(viewportWidth - (menuBox!.x + menuBox!.width)).toBeCloseTo(44, 0)
    expect(viewportWidth - (playbackBox!.x + playbackBox!.width)).toBeCloseTo(44, 0)
    await expect(scrim).toHaveCSS('padding-left', '34px')
    await expect(scrim).toHaveCSS('padding-right', '44px')

    const quickFilterTrigger = page.getByRole('button', { name: 'Quick filter posts' })
    await quickFilterTrigger.tap()
    const quickFilters = page.getByTestId('mobile-quick-filters')
    const firstQuickFilter = quickFilters.locator('[data-quick-filter-option]').first()
    await expect(quickFilters).toBeVisible()
    const [quickFiltersBox, firstQuickFilterBox] = await Promise.all([
      quickFilters.boundingBox(),
      firstQuickFilter.boundingBox(),
    ])
    expect(quickFiltersBox).not.toBeNull()
    expect(firstQuickFilterBox).not.toBeNull()
    expect(quickFiltersBox!.x).toBeCloseTo(34, 0)
    expect(viewportWidth - (quickFiltersBox!.x + quickFiltersBox!.width)).toBeCloseTo(140, 0)
    expect(firstQuickFilterBox!.x).toBeGreaterThanOrEqual(42)
    await quickFilterTrigger.tap()
    await expect(quickFilters).toHaveCount(0)

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
    const sheetContent = page.getByTestId('mobile-sheet-content')
    const queueFilter = sheetContent.locator('[data-theater-queue-filter]')
    const firstQueueFilter = queueFilter.locator('button').first()
    const firstQueueRow = sheetContent.locator('[data-theater-queue-item]').first()
    await expect(sheetContent).toHaveCSS('padding-left', '34px')
    await expect(sheetContent).toHaveCSS('padding-right', '44px')
    await expect(firstQueueFilter).toBeVisible()
    await expect(firstQueueRow).toBeVisible()
    const [firstQueueFilterBox, firstQueueRowBox] = await Promise.all([
      firstQueueFilter.boundingBox(),
      firstQueueRow.boundingBox(),
    ])
    expect(firstQueueFilterBox).not.toBeNull()
    expect(firstQueueRowBox).not.toBeNull()
    expect(firstQueueFilterBox!.x).toBeGreaterThanOrEqual(34)
    expect(firstQueueRowBox!.x).toBeGreaterThanOrEqual(34)
    expect(firstQueueFilterBox!.x + firstQueueFilterBox!.width).toBeLessThanOrEqual(
      viewportWidth - 44,
    )
    expect(firstQueueRowBox!.x + firstQueueRowBox!.width).toBeLessThanOrEqual(viewportWidth - 44)
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

  authedTest('Settings logo returns to aligned bottom chrome', async ({ page }) => {
    authedTest.setTimeout(90_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/settings')
    await page.getByRole('link', { name: 'ADHX home' }).click()
    await expectTheaterReady(page)

    const viewportHeight = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('.theater-shell-viewport')
      if (!shell) throw new Error('Theater viewport did not mount')
      shell.style.position = 'absolute'
      shell.style.bottom = 'auto'
      shell.style.height = `${window.innerHeight + 180}px`
      return window.innerHeight
    })

    const dock = page.getByTestId('mobile-theater-dock')
    const scrim = page.getByTestId('mobile-bottom-scrim')
    const actions = page.getByTestId('mobile-control-actions')
    const zone = page.getByTestId('mobile-swipe-zone')
    const capsule = zone.locator('[data-theater-swipe-control]')
    await expect(scrim).toHaveCSS('position', 'fixed')
    await expect(zone).toHaveCSS('position', 'fixed')

    const [dockBox, scrimBox, capsuleBox] = await Promise.all([
      dock.boundingBox(),
      scrim.boundingBox(),
      capsule.boundingBox(),
    ])
    const visibleActionBottom = await actions.locator(':scope > *').evaluateAll((railActions) =>
      railActions.reduce((bottom, action) => {
        const style = getComputedStyle(action)
        if (style.display === 'none' || style.visibility === 'hidden') return bottom
        return Math.max(bottom, action.getBoundingClientRect().bottom)
      }, 0),
    )
    expect(dockBox).not.toBeNull()
    expect(scrimBox).not.toBeNull()
    expect(capsuleBox).not.toBeNull()
    expect(visibleActionBottom).toBeGreaterThan(0)
    expect(
      Math.abs((scrimBox?.y ?? 0) + (scrimBox?.height ?? 0) - viewportHeight),
    ).toBeLessThanOrEqual(1)
    expect((capsuleBox?.y ?? 0) + (capsuleBox?.height ?? 0)).toBeLessThanOrEqual(dockBox?.y ?? 0)
    const actionToCapsuleGap = (capsuleBox?.y ?? 0) - visibleActionBottom
    expect(actionToCapsuleGap).toBeGreaterThanOrEqual(0)
    expect(actionToCapsuleGap).toBeLessThanOrEqual(12)
  })

  authedTest(
    'short landscape keeps four vertical actions clear and Q preserves focus',
    async ({ page }) => {
      authedTest.setTimeout(90_000)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { top: 0, left: 34, bottom: 0, right: 44 },
      })
      await page.goto('/saved')
      await expectTheaterReady(page)
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

      const postActions = page.getByTestId('mobile-control-actions')
      const paste = page.getByRole('button', { name: 'Paste a link' })
      const account = page.getByRole('button', { name: 'Account menu' })
      const swipe = page.locator('[data-theater-swipe-control]')
      const slider = page.locator('[data-theater-progress-slider]')
      const queue = page.locator('[data-theater-action="show-all"]:visible')
      const playback = page.getByTestId('mobile-playback-controls')
      await expect(postActions).toHaveCSS('flex-direction', 'column')
      await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Tag' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open on X' })).toBeVisible()

      const [actionsBox, pasteBox, accountBox, swipeBox, sliderBox, queueBox, playbackBox] =
        await Promise.all([
          postActions.boundingBox(),
          paste.boundingBox(),
          account.boundingBox(),
          swipe.boundingBox(),
          slider.boundingBox(),
          queue.boundingBox(),
          playback.boundingBox(),
        ])
      expect(actionsBox).not.toBeNull()
      expect(pasteBox).not.toBeNull()
      expect(accountBox).not.toBeNull()
      expect(swipeBox).not.toBeNull()
      expect(sliderBox).not.toBeNull()
      expect(queueBox).not.toBeNull()
      expect(playbackBox).not.toBeNull()
      expect(page.viewportSize()!.width - (actionsBox!.x + actionsBox!.width)).toBeCloseTo(156, 0)
      expect(page.viewportSize()!.width - (accountBox!.x + accountBox!.width)).toBeCloseTo(44, 0)
      expect(queueBox!.x).toBeCloseTo(34, 0)
      expect(page.viewportSize()!.width - (playbackBox!.x + playbackBox!.width)).toBeCloseTo(44, 0)
      expect(actionsBox!.x + actionsBox!.width).toBeLessThan(pasteBox!.x)
      expect(actionsBox!.x + actionsBox!.width).toBeLessThan(accountBox!.x)
      expect(actionsBox!.x + actionsBox!.width).toBeLessThan(swipeBox!.x)
      expect(actionsBox!.y + actionsBox!.height).toBeLessThan(sliderBox!.y)

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
