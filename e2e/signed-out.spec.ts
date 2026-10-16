import { test, expect } from '@playwright/test'
import { E2E_USERNAME, ONE_ITEM_TAG, PLAYLIST_TAG, POST, PRIVATE_TAG } from './constants'
import { expectSignInModal, expectTheaterReady } from './helpers'

test.describe('signed out', () => {
  test('/saved and /library bounce to the public theater', async ({ page }) => {
    // Signed-out `/` is the Live theater, which replaceStates the address bar
    // to the current post. Assert the bounce (not still on the authed route)
    // and that the theater mounted — not that the URL stays `/`.
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page).not.toHaveURL(/\/saved/)
    await expect(page).not.toHaveURL(/\/library/)

    await page.goto('/collection')
    await expectTheaterReady(page)
    await expect(page).not.toHaveURL(/\/collection/)
    await expect(page).not.toHaveURL(/\/saved/)

    await page.goto('/library')
    await expectTheaterReady(page)
    await expect(page).not.toHaveURL(/\/library/)
    await expect(page).not.toHaveURL(/\/saved/)
  })

  test('public channel is watchable; private channel stays locked', async ({ page }) => {
    await page.goto(`/t/${E2E_USERNAME}/${PLAYLIST_TAG}`)
    await expect(page.getByRole('heading', { level: 1, name: 'E2e pl' })).toBeVisible()
    await expect(page.getByText(POST.charlie.text).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Play' }).first()).toBeVisible()

    await page.goto(`/t/${E2E_USERNAME}/${PRIVATE_TAG}`)
    await expect(page.getByRole('heading', { name: 'Private channel' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Play' })).toHaveCount(0)
  })

  test('Save channel asks a signed-out viewer to sign in, then comes back', async ({ page }) => {
    await page.goto(`/t/${E2E_USERNAME}/${ONE_ITEM_TAG}`)
    await page.getByRole('link', { name: 'Sign in to save' }).first().click()
    await expect(page).toHaveURL(
      new RegExp(`/start\\?returnTo=${encodeURIComponent(`/t/${E2E_USERNAME}/${ONE_ITEM_TAG}`)}`),
    )
  })

  test('preview Save opens sign-in', async ({ page }) => {
    await page.goto(`/${POST.preview.author}/status/${POST.preview.id}`)
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Save' }).click()
    await expectSignInModal(page)
  })

  test('X OAuth is a Settings link, not a sign-in', async ({ page }) => {
    const res = await page.request.get('/api/auth/twitter', { maxRedirects: 0 })
    expect(res.status()).toBeGreaterThanOrEqual(300)
    expect(res.status()).toBeLessThan(400)
    expect(res.headers()['location'] ?? '').toMatch(/auth_error=x_link_only/)
    await page.goto('/?auth_error=x_link_only')
    await expectTheaterReady(page)
  })
})
