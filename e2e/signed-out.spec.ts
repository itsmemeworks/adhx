import { test, expect } from '@playwright/test'
import { E2E_USERNAME, ONE_ITEM_TAG, PLAYLIST_TAG, POST, PRIVATE_TAG } from './constants'
import { expectPreviewReady } from './helpers'

test.describe('signed out', () => {
  test('/saved and /library land on the home, with a way in', async ({ page }) => {
    for (const path of ['/saved', '/collection', '/library']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('link', { name: 'Start saving' })).toBeVisible()
    }
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

  test('Save on a shared post signs you in, then saves that post', async ({ page }) => {
    const path = `/${POST.preview.author}/status/${POST.preview.id}`
    await page.goto(path)
    await expectPreviewReady(page)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page).toHaveURL(/\/start\?/)
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(`${path}?save=1`)
  })

  test('X OAuth is a Settings link, not a sign-in', async ({ page }) => {
    const res = await page.request.get('/api/auth/twitter', { maxRedirects: 0 })
    expect(res.status()).toBeGreaterThanOrEqual(300)
    expect(res.status()).toBeLessThan(400)
    expect(res.headers()['location'] ?? '').toMatch(/auth_error=x_link_only/)
    await page.goto('/?auth_error=x_link_only')
    await expect(
      page.getByText('Sign in with your email first, then connect X in Settings.'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start saving' })).toBeVisible()
  })
})
