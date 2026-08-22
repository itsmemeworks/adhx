import { test, expect } from '@playwright/test'
import { E2E_USERNAME, ONE_ITEM_TAG, PLAYLIST_TAG, POST } from './constants'
import { expectTheaterReady, goNext } from './helpers'

test.describe('playlists loop until the viewer says otherwise', () => {
  test('a multi-item playlist wraps and never rewrites the playlist URL', async ({ page }) => {
    const playlistUrl = new RegExp(`/t/${E2E_USERNAME}/${PLAYLIST_TAG}$`)
    await page.goto(`/t/${E2E_USERNAME}/${PLAYLIST_TAG}`)
    await expectTheaterReady(page)
    await expect(page).toHaveURL(playlistUrl)
    await expect(page.getByText('Loops', { exact: true })).toBeVisible()

    await expect(page.getByText(POST.charlie.text).first()).toBeVisible()
    await goNext(page)
    await expect(page.getByText(POST.bravo.text).first()).toBeVisible()
    await expect(page).toHaveURL(playlistUrl)
    await goNext(page)
    await expect(page.getByText(POST.alpha.text).first()).toBeVisible()
    await goNext(page)
    await expect(page.getByText(POST.charlie.text).first()).toBeVisible()
    await expect(page).toHaveURL(playlistUrl)
  })

  test('a one-item playlist stays on that post through the timed dwell', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/t/${E2E_USERNAME}/${ONE_ITEM_TAG}`)
    await expectTheaterReady(page)
    await expect(page.getByText(POST.delta.text).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Keep playing|Repeat this post/ })).toBeVisible()

    // Text posts auto-advance after 10s unless looping-single / repeat-one.
    await page.waitForTimeout(11_000)
    await expect(page.getByText(POST.delta.text).first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/t/${E2E_USERNAME}/${ONE_ITEM_TAG}$`))
  })
})
