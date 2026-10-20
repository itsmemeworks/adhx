import { expect } from '@playwright/test'
import { E2E_USERNAME } from './constants'
import { authedTest } from './helpers'

authedTest.describe('settings account', () => {
  authedTest(
    'You is picture, name, username, email and Just for me; Change is the field plus Save/Cancel',
    async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
      await expect(page.getByRole('button', { name: /Change picture/ })).toBeVisible()
      await expect(page.getByText('Display name').first()).toBeVisible()
      await expect(page.getByText('Just for me by default').first()).toBeVisible()
      await expect(page.getByText(`@${E2E_USERNAME}`).first()).toBeVisible()
      const sync = page.locator('#sync')
      await expect(sync.getByText(/Connect X and we’ll bring in your bookmarks/)).toBeVisible()
      await expect(sync.getByRole('link', { name: /Connect X/ })).toHaveAttribute(
        'href',
        '/api/auth/twitter?returnUrl=%2Fsettings%3Fsync%3D1',
      )

      await page.getByRole('button', { name: 'Change username' }).click()
      await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
      await expect(page.getByText(/keep redirecting/i)).toHaveCount(0)

      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveCount(0)
      await expect(page.getByText(`@${E2E_USERNAME}`).first()).toBeVisible()
    },
  )

  authedTest('fits a phone screen with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Change username' }).click()
    await page.getByRole('button', { name: 'Change email' }).click()
    await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
