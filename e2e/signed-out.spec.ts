import { test, expect } from '@playwright/test'
import { E2E_USERNAME, ONE_ITEM_TAG, PLAYLIST_TAG, POST, PRIVATE_TAG } from './constants'
import { expectSignInModal, expectTheaterReady } from './helpers'

test.describe('signed out', () => {
  test('/collection and /library bounce to the public theater', async ({ page }) => {
    await page.goto('/collection')
    await expect(page).toHaveURL(/\/$/)
    await expectTheaterReady(page)

    await page.goto('/library')
    await expect(page).toHaveURL(/\/$/)
    await expectTheaterReady(page)
  })

  test('public playlist is watchable; private playlist stays locked', async ({ page }) => {
    await page.goto(`/t/${E2E_USERNAME}/${PLAYLIST_TAG}`)
    await expectTheaterReady(page)
    await expect(page.getByText(POST.charlie.text).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Make your own' })).toBeVisible()

    await page.goto(`/t/${E2E_USERNAME}/${PRIVATE_TAG}`)
    await expect(page.getByRole('heading', { name: 'Private playlist' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next post' })).toHaveCount(0)
  })

  test('Save playlist opens sign-in instead of cloning', async ({ page }) => {
    await page.goto(`/t/${E2E_USERNAME}/${ONE_ITEM_TAG}`)
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Make your own' }).click()
    await expectSignInModal(page)
  })

  test('preview Save opens sign-in', async ({ page }) => {
    await page.goto(`/${POST.preview.author}/status/${POST.preview.id}`)
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Save' }).click()
    await expectSignInModal(page)
  })
})
