import { test, expect } from '@playwright/test'
import { POST } from './constants'
import { expectPreviewReady } from './helpers'

test.describe('a shared post repeats until you move on', () => {
  test('the opened post stays on stage, set to repeat this post', async ({ page }) => {
    test.setTimeout(90_000)
    const previewPath = `/${POST.preview.author}/status/${POST.preview.id}`
    await page.goto(previewPath)
    await expectPreviewReady(page)
    await expect(page.getByText(POST.preview.text).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Repeat: This post' })).toBeVisible()

    // Longer than any post's timer: it's still here.
    await page.waitForTimeout(11_000)
    await expect(page.getByText(POST.preview.text).first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/${POST.preview.author}/status/${POST.preview.id}`))

    // Choosing the repeat mode is still yours.
    await page.getByRole('button', { name: 'Repeat: This post' }).click()
    await expect(page.getByRole('button', { name: /^Repeat: (Off|All)$/ })).toBeVisible()
  })
})
