import { expect } from '@playwright/test'
import { POST, TMP_TAG } from './constants'
import {
  apiDeleteTag,
  apiUnarchive,
  authedTest,
  caption,
  expectTheaterReady,
  feedHasId,
  tagsNamed,
} from './helpers'

authedTest.describe('collection actions', () => {
  authedTest.beforeEach(async ({ page }) => {
    await apiUnarchive(page, POST.alpha.id)
  })
  authedTest.afterEach(async ({ page }) => {
    await apiDeleteTag(page, TMP_TAG)
  })

  authedTest('Tag adds a playlist membership the /tags page can see', async ({ page }) => {
    await page.goto(`/collection?open=${POST.hotel.id}&platform=twitter`)
    await expectTheaterReady(page)
    await expect(caption(page, POST.hotel.text)).toBeVisible()

    await page.getByRole('button', { name: 'Tag', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Tag this post' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('New tag name').fill(TMP_TAG)
    await dialog.getByRole('button', { name: 'Add' }).click()
    await expect(dialog.getByText(`#${TMP_TAG}`)).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText(`#${TMP_TAG}`).first()).toBeVisible()
    expect(await tagsNamed(page)).toContain(TMP_TAG)

    await page.goto('/tags')
    await expect(page.getByText(`#${TMP_TAG}`).first()).toBeVisible()
  })

  authedTest('Delete removes the post; Undo restores it before the 5s commit', async ({ page }) => {
    const stage = page.getByRole('dialog', { name: 'Your collection' })
    await page.goto(`/collection?open=${POST.hotel.id}&platform=twitter`)
    await expectTheaterReady(page)
    await expect(stage.getByText(POST.hotel.text).first()).toBeVisible()

    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(stage.getByText(POST.hotel.text)).toHaveCount(0)

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(stage.getByText(POST.hotel.text).first()).toBeVisible()
    expect(await feedHasId(page, POST.hotel.id)).toBe(true)
  })

  authedTest('Later advances without removing the post from the collection', async ({ page }) => {
    const stage = page.getByRole('dialog', { name: 'Your collection' })
    await page.goto('/collection')
    await expectTheaterReady(page)
    const before = (await stage.locator('p').first().textContent())?.trim()
    expect(before).toBeTruthy()

    await page.getByRole('button', { name: 'Later' }).click()
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(stage.locator('p').first()).not.toHaveText(before!)
    expect(await feedHasId(page, POST.alpha.id)).toBe(true)
    expect(await feedHasId(page, POST.bravo.id)).toBe(true)
  })
})
