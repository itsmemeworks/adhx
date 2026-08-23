import { expect, test } from '@playwright/test'
import { POST } from './constants'
import {
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

    await page.keyboard.press('.')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Leaderboard' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)

    await page.keyboard.press('s')
    await expectSignInModal(page)
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
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    await expect(page).toHaveURL(/\/collection/)

    await page.keyboard.press('a')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(caption(page, POST.bravo.text)).toBeVisible()

    await page.keyboard.press('u')
    await expect(caption(page, POST.alpha.text)).toBeVisible()
  })

  authedTest('. opens the account menu', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    await page.keyboard.press('.')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Library' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
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
