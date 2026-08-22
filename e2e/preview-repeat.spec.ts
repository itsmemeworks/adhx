import { test, expect } from '@playwright/test'
import { POST } from './constants'
import { expectTheaterReady, goNext } from './helpers'

test.describe('preview pages repeat the shared post', () => {
  test('the opened post stays on stage until the viewer turns repeat off or advances', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const previewPath = `/${POST.preview.author}/status/${POST.preview.id}`
    await page.goto(previewPath)
    await expectTheaterReady(page)
    await expect(page.getByText(POST.preview.text).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/${POST.preview.author}/status/${POST.preview.id}`))

    await page.waitForTimeout(11_000)
    await expect(page.getByText(POST.preview.text).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()

    // First tap on a pinned preview releases the pin (off). Then Next leaves.
    await page.getByRole('button', { name: 'Repeat this post' }).click()
    await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()
    await goNext(page)
    await expect(page).not.toHaveURL(new RegExp(`/status/${POST.preview.id}`))
  })
})
