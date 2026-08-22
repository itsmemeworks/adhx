import { expect, test } from '@playwright/test'
import { POST } from './constants'
import { expectTheaterReady } from './helpers'

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('signed-out Live theater is usable at phone width', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Next post' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous post' })).toBeVisible()
  })

  test('tweet preview pin still holds on a phone', async ({ page }) => {
    test.setTimeout(90_000)
    const previewPath = `/${POST.preview.author}/status/${POST.preview.id}`
    await page.goto(previewPath)
    await expectTheaterReady(page)
    await expect(page.getByText(POST.preview.text).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()
  })
})
