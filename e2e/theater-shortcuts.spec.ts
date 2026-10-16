import { expect, test } from '@playwright/test'
import { POST } from './constants'
import { expectSignInModal, expectTheaterReady, readToggle, visibleQueueCount } from './helpers'

test.describe('theater shortcuts (signed out)', () => {
  test('Shift+? opens help, Escape closes it, arrows still advance after', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    const pause = page.getByRole('button', { name: 'Pause' })
    if (await pause.isVisible()) await pause.click()
    await expect(visibleQueueCount(page)).toHaveText(/\d+ in queue/)
    const first = page.getByRole('button', { name: 'Next post' })

    await page.keyboard.press('?')
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(help).toBeVisible()
    await expect(help.getByText('Play / pause')).toBeVisible()
    await expect(help.getByText('Next post')).toBeVisible()
    await expect(help.getByText('Previous post')).toBeVisible()
    await expect(help.getByText('Read / Watch', { exact: true })).toBeVisible()
    const archive = help.getByText('Archive', { exact: true })
    await expect(archive).toBeVisible()
    const readBox = await help.getByText('Read / Watch', { exact: true }).boundingBox()
    const archiveBox = await archive.boundingBox()
    expect(readBox).toBeTruthy()
    expect(archiveBox).toBeTruthy()
    expect(archiveBox!.y).toBeGreaterThan(readBox!.y)
    await expect(help.getByText('Re-watch all')).toBeVisible()
    await expect(help.getByText('Keep playing')).toBeVisible()
    await expect(help.getByText('Paste a link')).toBeVisible()
    await expect(help.getByText('Expand')).toBeVisible()
    await expect(help.getByText('Repeat')).toBeVisible()
    await expect(help.getByText('Theater')).toBeVisible()
    await expect(help.getByText('Discover', { exact: true })).toBeVisible()
    await expect(help.getByText('Saved', { exact: true })).toBeVisible()
    await expect(help.getByText('Queue', { exact: true })).toBeVisible()
    await expect(help.getByText('Scroll text')).toBeVisible()

    await page.keyboard.press('ArrowRight')
    await expect(help).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)

    await first.click()
    // Repeat off is remaining unseen (`N in queue`). Previous is always
    // available when another row exists and wraps into Repeat all at the head.
    await expect(visibleQueueCount(page)).toHaveText(/\d+ in queue/)
  })

  test('. opens the signed-out menu; S opens sign-in', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()

    await page.keyboard.press('.')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Leaderboard' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)

    await page.keyboard.press('s')
    await expectSignInModal(page)
  })

  test('. then arrows then Enter follows a menu link', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
    await page.keyboard.press('.')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Theater' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Leaderboard' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/leaderboard/)
  })

  test('F toggles Read / Watch on a quoted video', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/${POST.quoted.author}/status/${POST.quoted.id}`)
    await expectTheaterReady(page)
    await expect(readToggle(page)).toBeVisible()

    await page.keyboard.press('f')
    await expect(page.getByRole('button', { name: 'Watch' })).toBeVisible()

    await page.keyboard.press('f')
    await expect(readToggle(page)).toBeVisible()
  })

  test('ArrowDown does not advance; ArrowRight does; E expands; R cycles repeat', async ({
    page,
  }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    const pause = page.getByRole('button', { name: 'Pause' })
    if (await pause.isVisible()) await pause.click()
    const before = (await visibleQueueCount(page).innerText()).replace(/\s+/g, ' ').trim()

    await page.keyboard.press('ArrowDown')
    await expect(visibleQueueCount(page)).toHaveText(before)

    await page.keyboard.press('ArrowRight')
    await expect(visibleQueueCount(page)).toHaveText(/\d+ in queue/)
    await expect(visibleQueueCount(page)).not.toHaveText(before)
    await page.keyboard.press('ArrowLeft')
    await expect(visibleQueueCount(page)).toHaveText(/\d+ in queue/)

    await expect(page.getByRole('button', { name: 'Hide controls' })).toBeVisible()
    await page.keyboard.press('e')
    await expect(page.getByRole('button', { name: 'Show controls' })).toBeVisible()
    await page.keyboard.press('e')
    await expect(page.getByRole('button', { name: 'Hide controls' })).toBeVisible()

    const repeat = page.locator('[data-theater-action="repeat"]:visible')
    await expect(repeat).toHaveAttribute('aria-label', 'Stop when caught up')
    await page.keyboard.press('r')
    await expect(repeat).toHaveAttribute('aria-label', 'Keep playing')
    await page.keyboard.press('r')
    await expect(repeat).toHaveAttribute('aria-label', 'Repeat this post')
    await page.keyboard.press('r')
    await expect(repeat).toHaveAttribute('aria-label', 'Stop when caught up')
  })

  test('Queue type pills select one content type at a time', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await page.evaluate(() => {
      localStorage.removeItem('adhx-theater-types')
      localStorage.removeItem('adhx-theater-visual')
    })
    await page.goto('/')
    await expectTheaterReady(page)

    await expect(page.getByRole('button', { name: 'Paste link' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Videos', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Queue', exact: true }).click()
    const all = page.getByRole('button', { name: 'All post types', exact: true })
    const videos = page.getByRole('button', { name: 'Videos', exact: true })
    const photos = page.getByRole('button', { name: 'Photos', exact: true })
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(videos).toHaveAttribute('aria-pressed', 'false')
    await videos.click()
    await expect(videos).toHaveAttribute('aria-pressed', 'true')
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await photos.click()
    await expect(photos).toHaveAttribute('aria-pressed', 'true')
    await expect(videos).toHaveAttribute('aria-pressed', 'false')
    await all.click()
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(videos).toHaveAttribute('aria-pressed', 'false')
  })

  test('Q toggles Queue; arrows move; Escape and click away close', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)

    const toggle = page.getByRole('button', { name: 'Queue', exact: true })
    await page.keyboard.press('q')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = page.locator('[data-theater-queue-panel]')
    const current = page.locator(
      '[data-theater-queue-panel] [data-theater-queue-item][aria-current="true"]',
    )
    await expect(current).toBeFocused()
    const rows = page.locator('[data-theater-queue-panel] [data-theater-queue-item]')
    await expect(panel.getByText('Now playing', { exact: true })).toBeVisible()
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
    if ((await rows.count()) > 1) {
      await page.keyboard.press('ArrowDown')
      await expect(current).not.toBeFocused()
    }

    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await page.keyboard.press('q')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.click(64, 360)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  test('mobile Queue visibly starts with Now playing and the current row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expectTheaterReady(page)

    // This suite runs against Next dev, whose bottom-left dev-tools portal
    // overlaps the mobile Queue button at this viewport. The test is about
    // rendered queue order, so open it through the production Q shortcut.
    await page.keyboard.press('q')
    const sheet = page.getByTestId('mobile-sheet-content')
    const rows = sheet.locator('[data-theater-queue-item]')
    await expect(sheet.getByText('Now playing', { exact: true })).toBeVisible()
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
    if ((await rows.count()) > 1) {
      await expect(rows.nth(1).getByText('next ↓', { exact: true })).toBeVisible()
    }
  })
})
