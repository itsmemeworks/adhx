import { test, expect } from '@playwright/test'
import { POST } from './constants'
import { expectTheaterReady, pauseTheater } from './helpers'

test('desktop filters stay compact and playlist hides stage actions', async ({ page }) => {
  await page.setViewportSize({ width: 1129, height: 1204 })
  await page.goto(`/${POST.quoted.author}/status/${POST.quoted.id}`)
  await expectTheaterReady(page)
  await pauseTheater(page)
  const queue = page.getByRole('dialog', { name: 'Playlist', exact: true })
  const actions = page.locator('[data-theater-desktop-actions]')
  const trigger = page.getByRole('button', { name: 'Filter posts', exact: true })
  await expect(actions).toBeVisible()
  await page.getByRole('button', { name: 'Queue', exact: true }).click()
  await expect(queue).toBeVisible()
  await expect(actions).toBeHidden()
  const pills = queue.getByRole('group', { name: 'Playlist filter' }).getByRole('button')
  for (const pill of await pills.all()) {
    const box = await pill.boundingBox()
    expect(box!.height).toBe(32)
  }
  await page.screenshot({ path: '/tmp/adhx-desktop-compact-playlist.png', animations: 'disabled' })
  await trigger.click()
  await expect(queue).toBeHidden()
  await expect(actions).toBeHidden()
  const filters = page.getByRole('group', { name: 'Quick post filters' })
  await expect(filters).toBeVisible()
  const all = filters.getByRole('button', { name: 'All post types', exact: true })
  await expect(all).toHaveAccessibleDescription(/\d+ posts/)
  const initialCount = await all.getAttribute('aria-description')
  await filters.getByRole('button', { name: 'Videos', exact: true }).click()
  await expect(trigger).toContainText('Videos')
  await expect(all).toHaveAttribute('aria-description', initialCount!)
  await expect(
    filters.getByRole('button', { name: 'Photos', exact: true }),
  ).toHaveAccessibleDescription(/\d+ posts/)
  await page.screenshot({ path: '/tmp/adhx-desktop-quick-filters.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(filters).toBeHidden()
  await expect(actions).toBeVisible()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Shift+Q')
  await expect(filters).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(filters).toBeHidden()
  await expect(queue).toBeHidden()
})
