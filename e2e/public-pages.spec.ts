import { test, expect } from '@playwright/test'
import { E2E_USERNAME, PLAYLIST_TAG, POST } from './constants'
import { expectPreviewReady } from './helpers'

test.describe('public pages', () => {
  test('/api/health reports healthy', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { status?: string }
    expect(body.status).toBe('healthy')
  })

  test('retired pages send old links somewhere useful', async ({ page }) => {
    for (const path of ['/live', '/trending', '/trending/videos', '/discover']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/now$/)
    }
    // Channels is for signed-in people: sign in, then land there.
    for (const path of ['/leaderboard', '/leaderboard/today', '/collections']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/start\?returnTo=%2Fchannels$/)
    }
  })

  test('a curator profile lists their public channels', async ({ page }) => {
    await page.goto(`/t/${E2E_USERNAME}`)
    await expect(page.getByRole('heading', { level: 2, name: 'Channels' })).toBeVisible()
    await page
      .getByRole('link', { name: /E2e pl/ })
      .first()
      .click()
    await expect(page).toHaveURL(new RegExp(`/t/${E2E_USERNAME}/${PLAYLIST_TAG}`))
    await expect(page.getByRole('heading', { level: 1, name: 'E2e pl' })).toBeVisible()
  })

  test('privacy reads in the new design', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'adhx home' })).toBeVisible()
  })

  test('/share maps an X URL onto the preview theater', async ({ page }) => {
    await page.goto(`/share?url=https://x.com/${POST.preview.author}/status/${POST.preview.id}`)
    await expect(page).toHaveURL(new RegExp(`/${POST.preview.author}/status/${POST.preview.id}`))
    await expectPreviewReady(page)
  })

  test('/share rejects an unsupported link', async ({ page }) => {
    await page.goto('/share?url=https://example.com/not-a-post')
    await expect(page.getByRole('heading', { name: 'Not a supported link' })).toBeVisible()
  })

  test('the signed-out home: paste a link to watch it, and Right now underneath', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('#nx-home-title')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    const input = page.getByLabel('Paste a link to watch it')
    await input.fill('https://example.com/not-a-post')
    await input.press('Enter')
    await expect(page.getByText('That isn’t a post link we can play yet.')).toBeVisible()
    await input.fill(`https://x.com/${POST.alpha.author}/status/${POST.alpha.id}`)
    await input.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${POST.alpha.author}/status/${POST.alpha.id}`))
    await expectPreviewReady(page)
    await expect(page.getByText(POST.alpha.text).first()).toBeVisible()
  })
})
