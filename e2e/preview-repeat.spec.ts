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
    // Repeat lives in ⋯ (an open menu holds the post's timer, so close it again).
    const more = page.getByRole('button', { name: 'More options' })
    await more.click()
    await expect(page.getByRole('menuitem', { name: 'Repeat: This post' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: 'Options' })).toBeHidden()

    // Longer than any post's timer: it's still here.
    await page.waitForTimeout(11_000)
    await expect(page.getByText(POST.preview.text).first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/${POST.preview.author}/status/${POST.preview.id}`))

    // Choosing the repeat mode is still yours.
    await more.click()
    await page.getByRole('menuitem', { name: 'Repeat: This post' }).click()
    await expect(page.getByRole('menuitem', { name: /^Repeat: (Off|All)$/ })).toBeVisible()
  })
})
