import { expect } from '@playwright/test'
import { POST, TIKTOK_TWIN } from './constants'
import { authedTest, caption, expectTheaterReady } from './helpers'

authedTest.describe('signed-in library', () => {
  authedTest(
    'card tap leaves the grid for /saved and does not overlay theater on /library',
    async ({ page }) => {
      await page.goto('/library')
      await expect(caption(page, POST.echo.text)).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('button', { name: 'Next post' })).toHaveCount(0)

      await caption(page, POST.echo.text).click()
      await expect(page).toHaveURL(new RegExp(`/saved\\?open=${POST.echo.id}`))
      await expect(page).toHaveURL(/platform=twitter/)
      await expectTheaterReady(page)
      await expect(caption(page, POST.echo.text)).toBeVisible()
    },
  )

  authedTest('the same numeric id is a different post per platform', async ({ page }) => {
    await page.goto('/library')
    const twitter = await page.request.get(
      `/api/feed?id=${POST.alpha.id}&idPlatform=twitter&hideArchived=false`,
    )
    expect(twitter.ok(), await twitter.text()).toBeTruthy()
    const twitterBody = (await twitter.json()) as {
      items?: Array<{ platform: string; text: string }>
    }
    expect(twitterBody.items?.[0]?.platform).toBe('twitter')
    expect(twitterBody.items?.[0]?.text).toBe(POST.alpha.text)

    const tiktok = await page.request.get(
      `/api/feed?id=${TIKTOK_TWIN.id}&idPlatform=tiktok&hideArchived=false`,
    )
    expect(tiktok.ok()).toBeTruthy()
    const tiktokBody = (await tiktok.json()) as {
      items?: Array<{ platform: string; text: string }>
    }
    expect(tiktokBody.items?.[0]?.platform).toBe('tiktok')
    expect(tiktokBody.items?.[0]?.text).toBe(TIKTOK_TWIN.text)
  })
})
