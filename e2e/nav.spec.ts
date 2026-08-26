import { expect } from '@playwright/test'
import { E2E_USERNAME, PLAYLIST_TAG, POST } from './constants'
import { apiDeleteBookmark, authedTest, caption, expectTheaterReady, goNext } from './helpers'

authedTest.describe('signed-in navigation', () => {
  authedTest.afterEach(async ({ page }) => {
    await apiDeleteBookmark(page, POST.preview.id)
  })

  authedTest(
    'header and account menu reach Theater, Library, Tags, and Settings',
    async ({ page }) => {
      await page.goto('/library')
      await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })

      await page.getByRole('link', { name: 'Theater', exact: true }).click()
      await expectTheaterReady(page)

      await page.getByRole('button', { name: 'Account menu' }).click()
      await page.getByRole('menuitem', { name: 'Library' }).click()
      await expect(page).toHaveURL(/\/library/)

      await page.getByRole('link', { name: 'Tags', exact: true }).click()
      await expect(page).toHaveURL(/\/tags/)
      await expect(page.getByText(`#${PLAYLIST_TAG}`).first()).toBeVisible()

      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByText('Reading preferences')).toBeVisible()
    },
  )

  authedTest('signed-in / lands on Live', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/live/)
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Live', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0)
  })

  authedTest('Saved ↔ Live is a pair of routes', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()

    await page.goto('/live')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    await expect(page).toHaveURL(/\/saved/)
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
  })

  authedTest('signed-in preview shows Live ⇄ Saved; Close goes to library', async ({ page }) => {
    const previewPath = `/${POST.preview.author}/status/${POST.preview.id}`
    await page.goto(previewPath)
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Live' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    await expect(page).toHaveURL(/\/saved/)
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()

    await page.goto(previewPath)
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page).toHaveURL(/\/library/)
  })

  authedTest('collection Close lands on the library grid', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page).toHaveURL(/\/library/)
    await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })
  })

  authedTest('playlist owner gets Manage playlist, not Save playlist', async ({ page }) => {
    await page.goto(`/t/${E2E_USERNAME}/${PLAYLIST_TAG}`)
    await expectTheaterReady(page)
    await expect(page.getByRole('link', { name: 'Manage playlist' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Save playlist/ })).toHaveCount(0)
    await page.getByRole('link', { name: 'Manage playlist' }).click()
    await expect(page).toHaveURL(new RegExp(`/library\\?tag=${PLAYLIST_TAG}`))
    await expect(caption(page, POST.alpha.text)).toBeVisible({ timeout: 20_000 })
  })

  authedTest('j advances Live the same way Next post does', async ({ page }) => {
    await page.goto('/live')
    await expectTheaterReady(page)
    const first = page.url()
    await page.keyboard.press('j')
    await expect(page).not.toHaveURL(first)
    await expect(page).toHaveURL(/\/status\//)
    await goNext(page)
    await expect(page).toHaveURL(/\/status\//)
  })
})
