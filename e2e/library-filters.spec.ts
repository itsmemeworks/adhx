import { expect } from '@playwright/test'
import { E2E_USERNAME, PLAYLIST_TAG, POST, PRIVATE_TAG, TIKTOK_TWIN } from './constants'
import {
  addSessionCookie,
  apiSetTagPublic,
  apiUnarchive,
  authedTest,
  caption,
  tagIsPublic,
} from './helpers'

authedTest.describe('library filters', () => {
  authedTest.afterEach(async ({ page }) => {
    await addSessionCookie(page)
    await apiSetTagPublic(page, PRIVATE_TAG, false)
    await apiUnarchive(page, POST.alpha.id)
  })

  authedTest('search query shows only the matching card', async ({ page }) => {
    await page.goto(`/library?search=${POST.echo.text}`)
    await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(POST.alpha.text)).toHaveCount(0)
  })

  authedTest('tag filter keeps playlist members and drops the rest', async ({ page }) => {
    await page.goto('/library')
    await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Tags' }).click()
    await page.getByRole('button', { name: new RegExp(`#${PLAYLIST_TAG}`) }).click()
    await expect(page.getByText(`#${PLAYLIST_TAG}`, { exact: true }).first()).toBeVisible()
    await expect(caption(page, POST.alpha.text)).toBeVisible()
    await expect(caption(page, POST.echo.text)).toHaveCount(0)
  })

  authedTest('archived posts stay hidden until Show archived', async ({ page }) => {
    const archived = await page.request.post(
      `/api/bookmarks/${POST.alpha.id}/read?platform=twitter`,
    )
    expect(archived.ok(), await archived.text()).toBeTruthy()

    await page.goto('/library')
    await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(POST.alpha.text)).toHaveCount(0)

    await page.getByRole('button', { name: 'Show archived' }).click()
    await expect(caption(page, POST.alpha.text)).toBeVisible()
  })

  authedTest('Make public unlocks the share API for signed-out visitors', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/library')
    await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Tags' }).click()
    await page.getByRole('button', { name: new RegExp(`#${PRIVATE_TAG}`) }).click()
    await page.getByRole('button', { name: 'Make public' }).click()
    await expect(page.getByRole('button', { name: 'Make private' })).toBeVisible()
    expect(await tagIsPublic(page, PRIVATE_TAG)).toBe(true)

    const share = await page.request.get(`/api/share/tag/by-name/${E2E_USERNAME}/${PRIVATE_TAG}`)
    expect(share.ok(), await share.text()).toBeTruthy()
    const body = (await share.json()) as { tweets?: Array<{ text?: string }> }
    expect(body.tweets?.some((t) => t.text === POST.echo.text)).toBe(true)

    const playlist = await page.request.get(`/t/${E2E_USERNAME}/${PRIVATE_TAG}`)
    expect(playlist.ok(), await playlist.text()).toBeTruthy()
    const html = await playlist.text()
    expect(html).not.toContain('Private playlist')
  })

  authedTest('list view still shows the library cards', async ({ page }) => {
    await page.goto('/library')
    await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'List view' }).click()
    await expect(caption(page, POST.echo.text)).toBeVisible()
  })

  authedTest('platform filter keeps TikTok and drops an X-only card', async ({ page }) => {
    await page.goto('/library')
    await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'All platforms' }).click()
    await page.getByRole('button', { name: 'TikTok', exact: true }).click()
    await expect(caption(page, TIKTOK_TWIN.text)).toBeVisible()
    await expect(page.getByText(POST.echo.text)).toHaveCount(0)
  })
})
