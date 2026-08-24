import { expect } from '@playwright/test'
import { POST, TMP_TAG } from './constants'
import {
  apiDeleteTag,
  apiUnarchive,
  authedTest,
  caption,
  expectTheaterReady,
  goNext,
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

  authedTest(
    'collection actions match Live plus Archive — no Later or Delete',
    async ({ page }) => {
      await page.goto(`/collection?open=${POST.hotel.id}&platform=twitter`)
      await expectTheaterReady(page)
      await expect(page.getByRole('button', { name: 'Link', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Tag', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Later' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Open' })).toHaveAttribute(
        'href',
        `https://x.com/${POST.hotel.author}/status/${POST.hotel.id}`,
      )
    },
  )

  authedTest(
    'Next and arrows skip without a Later toast; Delete key is inert',
    async ({ page }) => {
      await page.goto(`/collection?open=${POST.alpha.id}&platform=twitter`)
      await expectTheaterReady(page)
      await expect(caption(page, POST.alpha.text)).toBeVisible()

      await goNext(page)
      await expect(caption(page, POST.bravo.text)).toBeVisible()
      await expect(page.getByText('Later')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)

      await page.keyboard.press('ArrowRight')
      await expect(caption(page, POST.charlie.text)).toBeVisible()
      await expect(page.getByText('Later')).toHaveCount(0)

      await page.keyboard.press('Delete')
      await expect(caption(page, POST.charlie.text)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    },
  )
})

authedTest.describe('collection actions (mobile)', () => {
  authedTest.use({ viewport: { width: 390, height: 844 } })

  authedTest(
    'mobile row is Share / Tag / Open / Archive — no Later or Delete',
    async ({ page }) => {
      await page.goto(`/collection?open=${POST.hotel.id}&platform=twitter`)
      await expectTheaterReady(page)
      await expect(page.getByRole('button', { name: 'Share link' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Tag' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open on X' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Later' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    },
  )
})
