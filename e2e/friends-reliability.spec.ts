import { expect } from '@playwright/test'
import { authedTest as test } from './helpers'
import { FROG_TITLE } from './constants'

/** Real rendering and interaction in Chromium and mobile WebKit. All data and
 * requests stay on the isolated fixture server; no external service is touched. */
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]) {
  test(`live reaction recovery fits ${viewport.width}×${viewport.height}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/now')
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: FROG_TITLE, exact: true }) })
    const href = await card
      .getByRole('link', { name: /Tune in/ })
      .getAttribute('href', { timeout: 60_000 })
    expect(href).toBeTruthy()
    await page.goto(href!)
    const react = page.getByRole('button', { name: 'React', exact: true })
    await expect(react).toBeVisible({ timeout: 60_000 })
    const sent: Record<string, unknown>[] = []
    await page.route('**/api/moments/*/react', async (route) => {
      sent.push(route.request().postDataJSON())
      await route.fulfill({
        status: sent.length === 1 ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(sent.length === 1 ? { error: 'retry' } : { ok: true }),
      })
    })
    await react.click({ timeout: 10_000 })
    const dialog = page.getByRole('dialog', { name: 'React', exact: true })
    await expect(dialog).toBeVisible()
    const words = dialog.getByRole('textbox', { name: 'Say something' })
    await words.fill('Worth watching 💀')
    await dialog.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await expect(words).toHaveValue('Worth watching 💀')
    await expect(dialog.getByRole('status')).toContainText('didn’t send')
    // Large text and a short landscape viewport must keep every action reachable.
    if (viewport.width === 320 || viewport.height === 390) {
      await page.addStyleTag({
        content:
          '[role="dialog"][aria-label="React"] p { font-size: 24px !important; line-height: 1.4 !important; }',
      })
    }
    const box = await dialog.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box!.height).toBeLessThanOrEqual(viewport.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width + 1,
    )
    await page.screenshot({ path: `/tmp/adhx562-web-${info.project.name}-${viewport.width}.png` })
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(sent).toHaveLength(2)
    expect(sent[0]).toEqual(sent[1])
    const more = page
      .getByRole('navigation', { name: 'Post actions' })
      .getByRole('button', { name: 'More options' })
    await more.scrollIntoViewIfNeeded()
    const action = await more.boundingBox()
    expect(action!.y).toBeGreaterThanOrEqual(0)
    expect(action!.y + action!.height).toBeLessThanOrEqual(viewport.height + 1)
  })
}

test('processing errors show recovery without pretending the queue is empty', async ({ page }) => {
  let failing = true
  await page.route('**/api/activity/processing?*', async (route) => {
    await route.fulfill({
      status: failing ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        summary: {
          onTheirWay: 0,
          keeping: 0,
          learning: 0,
          needsYou: 0,
          ready: 0,
          freeBytes: null,
          processing: 'remote',
          remoteConnected: true,
        },
      }),
    })
  })
  await page.goto('/doing')
  await expect(page.getByText('Couldn’t update progress. Trying again shortly.')).toBeVisible()
  await expect(page.getByText('All kept, all learned.')).toHaveCount(0)
  failing = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('All kept, all learned.')).toBeVisible()
})
