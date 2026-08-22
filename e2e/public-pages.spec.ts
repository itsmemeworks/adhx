import { test, expect } from '@playwright/test'
import { E2E_USERNAME, PLAYLIST_TAG, POST } from './constants'
import { expectTheaterReady } from './helpers'

test.describe('public pages', () => {
  test('/api/health reports healthy', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { status?: string }
    expect(body.status).toBe('healthy')
  })

  test('/trending lists the pulse and opens a preview', async ({ page }) => {
    await page.goto('/trending')
    await expect(page.getByRole('link', { name: 'Leaderboard →' })).toBeVisible()
    await expect(page.getByText(POST.preview.text).first()).toBeVisible()
    await page.locator(`a[href="/${POST.preview.author}/status/${POST.preview.id}"]`).last().click()
    await expect(page).toHaveURL(new RegExp(`/${POST.preview.author}/status/${POST.preview.id}`))
    await expectTheaterReady(page)
  })

  test('/leaderboard ranks the public playlist', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.getByRole('heading', { name: 'The most-watched playlists' })).toBeVisible()
    await expect(page.getByText(`#${PLAYLIST_TAG}`).first()).toBeVisible()
    await page.getByRole('link', { name: `View #${PLAYLIST_TAG}` }).click()
    await expect(page).toHaveURL(new RegExp(`/t/${E2E_USERNAME}/${PLAYLIST_TAG}`))
    await expectTheaterReady(page)
  })

  test('legacy discovery URLs redirect', async ({ page }) => {
    await page.goto('/discover')
    await expect(page).toHaveURL(/\/trending/)
    await page.goto('/collections')
    await expect(page).toHaveURL(/\/leaderboard/)
  })

  test('/share maps an X URL onto the preview theater', async ({ page }) => {
    await page.goto(`/share?url=https://x.com/${POST.preview.author}/status/${POST.preview.id}`)
    await expect(page).toHaveURL(new RegExp(`/${POST.preview.author}/status/${POST.preview.id}`))
    await expectTheaterReady(page)
  })

  test('/share rejects an unsupported link', async ({ page }) => {
    await page.goto('/share?url=https://example.com/not-a-post')
    await expect(page.getByRole('heading', { name: 'Not a supported link' })).toBeVisible()
  })

  test('paste-to-preview on Live opens the shared post', async ({ page }) => {
    await page.goto('/')
    await expectTheaterReady(page)
    const input = page.getByLabel('Paste a link to preview')
    await input.fill(`https://x.com/${POST.alpha.author}/status/${POST.alpha.id}`)
    await input.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${POST.alpha.author}/status/${POST.alpha.id}`))
    await expectTheaterReady(page)
    await expect(page.getByText(POST.alpha.text).first()).toBeVisible()
  })
})
