import { expect } from '@playwright/test'
import { CLONE_TAG, CURATOR_POSTS, POST } from './constants'
import {
  apiDeleteBookmark,
  apiDeleteTag,
  authedTest,
  expectPreviewReady,
  feedHasId,
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
    await expectPreviewReady(page)
    // The authoritative contract is the bookmark write.
    await expect.poll(() => feedHasId(page, POST.preview.id), { timeout: 30_000 }).toBe(true)
    await expect(page.getByRole('button', { name: 'Saved. Add to a channel' })).toBeVisible()
  })
})
