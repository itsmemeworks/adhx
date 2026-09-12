import { expect, test } from '@playwright/test'
import { PREVIEW_IG, PREVIEW_IG_PHOTO, PREVIEW_TT, PREVIEW_YT } from './constants'
import { caption, expectTheaterReady } from './helpers'

test.describe('preview pages for every platform', () => {
  test('Instagram reel preview mounts the theater', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/reels/${PREVIEW_IG.id}`)
    await expectTheaterReady(page)
    await expect(caption(page, PREVIEW_IG.text)).toBeVisible()
  })

  test('Instagram image carousel mounts every ordered slide without a video player', async ({
    page,
  }) => {
    await page.route('**/api/media/instagram/thumbnail**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="100%" height="100%" fill="#e8795b"/></svg>',
      }),
    )

    await page.goto(`/p/${PREVIEW_IG_PHOTO.id}`)
    await expectTheaterReady(page)
    await expect(caption(page, PREVIEW_IG_PHOTO.text)).toBeVisible()

    const slides = page
      .getByRole('region', { name: `Photos, ${PREVIEW_IG_PHOTO.imageCount}` })
      .locator('img')
    await expect(slides).toHaveCount(PREVIEW_IG_PHOTO.imageCount)
    for (let index = 0; index < PREVIEW_IG_PHOTO.imageCount; index += 1) {
      await expect(slides.nth(index)).toHaveAttribute(
        'src',
        `/api/media/instagram/thumbnail?id=${PREVIEW_IG_PHOTO.id}&index=${index + 1}`,
      )
    }
    await expect(slides.first()).toBeVisible()
    await expect(page.locator('video:visible')).toHaveCount(0)
    await expect(page.locator('iframe[title="Instagram Reel"]:visible')).toHaveCount(0)
  })

  test('TikTok preview mounts the theater', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/@${PREVIEW_TT.author}/video/${PREVIEW_TT.id}`)
    await expectTheaterReady(page)
    await expect(caption(page, PREVIEW_TT.text)).toBeVisible()
  })

  test('YouTube Shorts preview mounts the theater', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(`/shorts/${PREVIEW_YT.id}`)
    await expectTheaterReady(page)
    await expect(caption(page, PREVIEW_YT.text)).toBeVisible()
  })
})

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'}: a legacy Instagram Reel resolves to a photo album`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/api/media/instagram/video?**', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ contentType: 'photo', photoCount: 2 }),
      }),
    )
    await page.route('**/api/media/instagram/thumbnail**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="100%" height="100%" fill="#e8795b"/></svg>',
      }),
    )
    await page.goto(`/reels/${PREVIEW_IG.id}`)
    await expectTheaterReady(page)
    const slides = page.getByRole('region', { name: 'Photos, 2' }).locator('img')
    await expect(slides).toHaveCount(2)
    await expect(slides.first()).toBeVisible()
    await expect(page.locator('video:visible')).toHaveCount(0)
    await expect(page.locator('iframe[title="Instagram Reel"]:visible')).toHaveCount(0)
  })

  test(`${mobile ? 'mobile' : 'desktop'}: an unavailable Reel offers the original Instagram post`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/api/media/instagram/video?**', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Instagram video unavailable' }),
      }),
    )
    await page.route('https://www.instagram.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: 'Post unavailable' }),
    )
    await page.goto(`/reels/${PREVIEW_IG.id}`)
    await expectTheaterReady(page)
    await expect(
      page.getByText('We couldn’t load this video. Try the original post on Instagram.'),
    ).toBeVisible()
    const original = page.getByRole('link', { name: 'Open Instagram', exact: true })
    await expect(original).toHaveAttribute('href', `https://www.instagram.com/p/${PREVIEW_IG.id}/`)
    await expect(original).toHaveAttribute('target', '_blank')
    await original.click({ trial: true, timeout: 5000 })
  })
}
