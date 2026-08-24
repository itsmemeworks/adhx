import { expect } from '@playwright/test'
import { E2E_USERNAME } from './constants'
import { authedTest } from './helpers'

authedTest.describe('settings account', () => {
  authedTest(
    'Account is email + username; Change is the field plus Save/Cancel',
    async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.getByText('Your email, public username, and avatar')).toBeVisible()
      await expect(page.getByText('Generated from your username')).toBeVisible()
      await expect(page.getByText(`@${E2E_USERNAME}`)).toBeVisible()
      await expect(page.getByText(/connect your x account to sync your bookmarks/i)).toBeVisible()

      await page.getByRole('button', { name: 'Change' }).nth(1).click()
      await expect(page.getByLabel('Username')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
      await expect(page.getByText(/keep redirecting/i)).toHaveCount(0)

      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByLabel('Username')).toHaveCount(0)
      await expect(page.getByText(`@${E2E_USERNAME}`)).toBeVisible()
    },
  )
})
