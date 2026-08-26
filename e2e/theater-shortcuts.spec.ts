import { expect, test } from '@playwright/test'
import { POST } from './constants'
import {
  apiDeleteTag,
  apiUnarchive,
  authedTest,
  caption,
  clearArchives,
  expectSignInModal,
  expectTheaterReady,
  visibleQueueCount,
} from './helpers'

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
    await expect(help.getByText('Live', { exact: true })).toBeVisible()
    await expect(help.getByText('Saved', { exact: true })).toBeVisible()
    await expect(help.getByText('Queue', { exact: true })).toBeVisible()
    await expect(help.getByText('Scroll text')).toBeVisible()

    await page.keyboard.press('ArrowRight')
    await expect(help).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)

    await first.click()
    // Repeat off is remaining unseen (`N in queue`). Next shrinks that
    // number; Previous stays disabled until the viewer has left the newest.
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
    await expect(page.getByRole('button', { name: 'Read' })).toBeVisible()

    await page.keyboard.press('f')
    await expect(page.getByRole('button', { name: 'Watch' })).toBeVisible()

    await page.keyboard.press('f')
    await expect(page.getByRole('button', { name: 'Read' })).toBeVisible()
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

  test('Queue type pills are a multi-select', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await page.evaluate(() => {
      localStorage.removeItem('adhx-theater-types')
      localStorage.removeItem('adhx-theater-visual')
    })
    await page.goto('/')
    await expectTheaterReady(page)

    await expect(page.getByRole('button', { name: 'Paste a link' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Videos', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Queue', exact: true }).click()
    const all = page.getByRole('button', { name: 'All', exact: true })
    const videos = page.getByRole('button', { name: 'Videos', exact: true })
    const photos = page.getByRole('button', { name: 'Photos', exact: true })
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(videos).toHaveAttribute('aria-pressed', 'false')
    await videos.click()
    await expect(videos).toHaveAttribute('aria-pressed', 'true')
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await photos.click()
    await expect(photos).toHaveAttribute('aria-pressed', 'true')
    await expect(videos).toHaveAttribute('aria-pressed', 'true')
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
    const current = page.locator(
      '[data-theater-queue-panel] [data-theater-queue-item][aria-current="true"]',
    )
    await expect(current).toBeFocused()
    const rows = page.locator('[data-theater-queue-panel] [data-theater-queue-item]')
    if ((await rows.count()) > 1) {
      await page.keyboard.press('ArrowDown')
      await expect(current).not.toBeFocused()
    }

    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await page.keyboard.press('q')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.click(720, 360)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

authedTest.describe('theater shortcuts (signed in)', () => {
  authedTest.afterEach(async ({ page }) => {
    await page.request.delete(`/api/bookmarks/${POST.alpha.id}/read?platform=twitter`)
    clearArchives()
  })

  authedTest('T opens the tag picker; A archives and U undoes', async ({ page }) => {
    await apiUnarchive(page, POST.alpha.id)
    await page.goto(`/saved?open=${POST.alpha.id}&platform=twitter`)
    await expectTheaterReady(page)
    await expect(caption(page, POST.alpha.text)).toBeVisible()

    await page.keyboard.press('t')
    const picker = page.getByRole('dialog', { name: 'Tag this post' })
    await expect(picker).toBeVisible()
    await expect(picker.getByLabel('New tag name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    await expect(page).toHaveURL(/\/saved/)

    await page.keyboard.press('a')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(caption(page, POST.bravo.text)).toBeVisible()

    await page.keyboard.press('u')
    await expect(caption(page, POST.alpha.text)).toBeVisible()
  })

  authedTest('Q then Escape on Saved closes Queue, not the theater', async ({ page }) => {
    await apiUnarchive(page, POST.alpha.id)
    await page.goto('/saved')
    await expectTheaterReady(page)
    const toggle = page.getByRole('button', { name: 'Queue', exact: true })
    await page.keyboard.press('q')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page).toHaveURL(/\/saved/)
    await expect(page.getByRole('button', { name: 'Next post' })).toBeVisible()
  })

  authedTest('T then type then Enter creates a tag and closes; arrows toggle', async ({ page }) => {
    await apiUnarchive(page, POST.alpha.id)
    await page.goto(`/saved?open=${POST.alpha.id}&platform=twitter`)
    await expectTheaterReady(page)

    await page.keyboard.press('t')
    const picker = page.getByRole('dialog', { name: 'Tag this post' })
    await expect(picker.getByLabel('New tag name')).toBeFocused()
    const firstTag = picker.locator('[data-tag-option]').first()
    await expect(firstTag).toBeVisible()

    await page.keyboard.press('ArrowDown')
    await expect(firstTag).toBeFocused()
    const wasChecked = await firstTag.getAttribute('aria-checked')
    await page.keyboard.press('Space')
    await expect(firstTag).toHaveAttribute('aria-checked', wasChecked === 'true' ? 'false' : 'true')
    await page.keyboard.press('Space')
    await expect(firstTag).toHaveAttribute('aria-checked', wasChecked ?? 'false')

    await page.keyboard.press('ArrowUp')
    await expect(picker.getByLabel('New tag name')).toBeFocused()
    await page.keyboard.type('kb-new')
    await page.keyboard.press('Enter')
    await expect(picker).toHaveCount(0)

    await apiDeleteTag(page, 'kb-new')
  })

  authedTest('. opens the account menu', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.keyboard.press('.')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Library' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Live' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Saved' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
  })

  authedTest('. then arrows then Enter switches to Saved', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.keyboard.press('.')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Theater' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Live' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Saved' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/saved/)
  })

  authedTest('. then arrows then Enter follows a menu link', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.keyboard.press('.')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Theater' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Leaderboard' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/leaderboard/)
  })

  authedTest('1 and 2 switch Live ⇄ Saved', async ({ page }) => {
    await page.goto('/live')
    await expectTheaterReady(page)
    const liveTab = page.getByRole('button', { name: 'Live', exact: true })
    const savedTab = page.getByRole('button', { name: 'Saved', exact: true })
    await expect(liveTab).toHaveAttribute('aria-current', 'true')

    await page.keyboard.press('2')
    await expect(page).toHaveURL(/\/saved/)
    await expectTheaterReady(page)
    await expect(savedTab).toHaveAttribute('aria-current', 'true')

    // Focus the tab chrome so a stage iframe cannot eat Digit1.
    await savedTab.click()
    await page.keyboard.press('1')
    await expect(liveTab).toHaveAttribute('aria-current', 'true')
    await expect(page).not.toHaveURL(/\/saved/)
  })
})

authedTest.describe('library has no shortcut overlay', () => {
  authedTest('?, /, f, and 2 do nothing on /library', async ({ page }) => {
    await page.goto('/library')
    await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })

    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
    await expect(page).toHaveURL(/\/library/)

    await page.keyboard.press('/')
    await expect(page.getByRole('button', { name: 'Search' })).not.toBeFocused()
    await expect(page.getByPlaceholder('Search')).toHaveCount(0)

    await page.keyboard.press('f')
    await expect(page).toHaveURL(/\/library/)
    await expect(page.getByRole('button', { name: 'Next post' })).toHaveCount(0)

    await page.keyboard.press('2')
    await expect(caption(page, POST.echo.text)).toBeVisible()
    await expect(page.getByText(POST.alpha.text)).toBeVisible()
  })
})
