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
} from './helpers'

test.describe('theater shortcuts (signed out)', () => {
  test('Shift+? opens help, Escape closes it, arrows still advance after', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
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

    await page.keyboard.press('ArrowRight')
    await expect(help).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)

    await first.click()
    await expect(page.getByRole('button', { name: 'Previous post' })).toBeEnabled()
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

  test('R toggles Read / Watch on a quoted video', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/${POST.quoted.author}/status/${POST.quoted.id}`)
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Read' })).toBeVisible()

    await page.keyboard.press('r')
    await expect(page.getByRole('button', { name: 'Watch' })).toBeVisible()

    await page.keyboard.press('r')
    await expect(page.getByRole('button', { name: 'Read' })).toBeVisible()
  })
})

authedTest.describe('theater shortcuts (signed in)', () => {
  authedTest.afterEach(async ({ page }) => {
    await page.request.delete(`/api/bookmarks/${POST.alpha.id}/read?platform=twitter`)
    clearArchives()
  })

  authedTest('T opens the tag picker; A archives and U undoes', async ({ page }) => {
    await apiUnarchive(page, POST.alpha.id)
    await page.goto(`/collection?open=${POST.alpha.id}&platform=twitter`)
    await expectTheaterReady(page)
    await expect(caption(page, POST.alpha.text)).toBeVisible()

    await page.keyboard.press('t')
    const picker = page.getByRole('dialog', { name: 'Tag this post' })
    await expect(picker).toBeVisible()
    await expect(picker.getByLabel('New tag name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    await expect(page).toHaveURL(/\/collection/)

    await page.keyboard.press('a')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(caption(page, POST.bravo.text)).toBeVisible()

    await page.keyboard.press('u')
    await expect(caption(page, POST.alpha.text)).toBeVisible()
  })

  authedTest('T then type then Enter creates a tag and closes; arrows toggle', async ({ page }) => {
    await apiUnarchive(page, POST.alpha.id)
    await page.goto(`/collection?open=${POST.alpha.id}&platform=twitter`)
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
    await expect(page.getByRole('menuitem', { name: 'My Collection' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
  })

  authedTest('. then arrows then Enter switches to My Collection', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.keyboard.press('.')
    await expect(page.getByRole('menuitem', { name: 'Library' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Live' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'My Collection' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/collection/)
  })

  authedTest('. then arrows then Enter follows a menu link', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.keyboard.press('.')
    await expect(page.getByRole('menuitem', { name: 'Library' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Leaderboard' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/leaderboard/)
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
    await expect(page.getByLabel('Search bookmarks')).not.toBeFocused()

    await page.keyboard.press('f')
    await expect(page).toHaveURL(/\/library/)
    await expect(page.getByRole('button', { name: 'Next post' })).toHaveCount(0)

    await page.keyboard.press('2')
    await expect(caption(page, POST.echo.text)).toBeVisible()
    await expect(page.getByText(POST.alpha.text)).toBeVisible()
  })
})
