import { expect, test } from '@playwright/test'
import { POST, QUOTED_INNER } from './constants'
import { addSessionCookie, caption, expectTheaterReady, readToggle } from './helpers'

const quotedPath = `/${POST.quoted.author}/status/${POST.quoted.id}`

test.describe('Read / Watch on a video+quote preview', () => {
  test('signed-out desktop: labeled Read opens the article, Watch returns', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(quotedPath)
    await expectTheaterReady(page)
    await expect(caption(page, POST.quoted.text)).toBeVisible()
    const read = readToggle(page)
    await expect(read).toBeVisible()
    await expect(read).toHaveText(/Read/)
    await read.click()
    await expect(page.getByRole('button', { name: 'Watch' })).toBeVisible()
    await expect(page.getByText(QUOTED_INNER.text).first()).toBeVisible()
    await page.getByRole('button', { name: 'Watch' }).click()
    await expect(readToggle(page)).toBeVisible()
    await expect(caption(page, POST.quoted.text)).toBeVisible()
  })

  test('signed-in desktop: the same toggle works after autosave chrome mounts', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await addSessionCookie(page)
    await page.goto(quotedPath)
    await expectTheaterReady(page)
    const read = readToggle(page)
    await expect(read).toBeVisible()
    await read.click()
    await expect(page.getByRole('button', { name: 'Watch' })).toBeVisible()
    await page.getByRole('button', { name: 'Watch' }).click()
    await expect(readToggle(page)).toBeVisible()
  })
})

test.describe('Read / Watch on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('signed-out mobile: Read is icon-only on the left of the action row', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(quotedPath)
    await expectTheaterReady(page)
    await expect(caption(page, POST.quoted.text)).toBeVisible()
    const read = readToggle(page)
    await expect(read).toBeVisible()
    await expect(read).not.toHaveText('Read')
    await read.click()
    const watch = page.getByRole('button', { name: 'Watch' })
    await expect(watch).toBeVisible()
    await expect(watch).not.toHaveText('Watch')
    await expect(page.getByText(QUOTED_INNER.text).first()).toBeVisible()
  })
})
