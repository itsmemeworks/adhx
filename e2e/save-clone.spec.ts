import { expect } from '@playwright/test'
import { CLONE_TAG, CURATOR_POSTS, E2E_CURATOR_USERNAME, POST } from './constants'
import {
  apiDeleteBookmark,
  apiDeleteTag,
  authedTest,
  expectTheaterReady,
  feedHasId,
  tagsNamed,
} from './helpers'

authedTest.describe('save and clone', () => {
  authedTest.beforeEach(async ({ page }) => {
    await apiDeleteBookmark(page, POST.preview.id)
  })

  authedTest.afterEach(async ({ page }) => {
    await apiDeleteBookmark(page, POST.preview.id)
    for (const post of CURATOR_POSTS) {
      await apiDeleteBookmark(page, post.id)
    }
    await apiDeleteTag(page, CLONE_TAG)
  })

  authedTest('signed-in landing on a preview writes the bookmark', async ({ page }) => {
    expect(await feedHasId(page, POST.preview.id)).toBe(false)
    await page.goto(`/${POST.preview.author}/status/${POST.preview.id}`)
    await expectTheaterReady(page)
    // New-open autosave may already have flipped Save → Saved → Tag before
    // we click. `name: 'Save'` also matches "Saved" — use exact.
    const save = page.getByRole('button', { name: 'Save', exact: true })
    if (await save.isVisible()) await save.click()
    await expect(page.getByRole('button', { name: /^(Saved|Tag)/ })).toBeVisible()
    await expect.poll(() => feedHasId(page, POST.preview.id)).toBe(true)
  })

  authedTest('Save playlist clones a curator tag the viewer does not own', async ({ page }) => {
    await page.goto(`/t/${E2E_CURATOR_USERNAME}/${CLONE_TAG}`)
    await expectTheaterReady(page)
    await expect(page.getByText(POST.india.text).first()).toBeVisible()

    const clone = page.waitForResponse(
      (r) => r.url().includes('/clone') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: `Save playlist · ${CURATOR_POSTS.length}` }).click()
    const res = await clone
    expect(res.ok(), `${res.status()} ${await res.text()}`).toBeTruthy()
    await expect(page.getByRole('link', { name: /Saved.*library/ })).toBeVisible()

    for (const post of CURATOR_POSTS) {
      expect(await feedHasId(page, post.id)).toBe(true)
    }
    expect(await tagsNamed(page)).toContain(CLONE_TAG)

    await page.getByRole('link', { name: /Saved.*library/ }).click()
    await expect(page).toHaveURL(/\/library/)
    await expect(page.getByText(POST.india.text).first()).toBeVisible()
  })
})
