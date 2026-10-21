import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { authedTest as test } from './helpers'

const clip = readFileSync(new URL('./fixtures/sound.webm', import.meta.url))
const item = (n: number) => ({
  saved: true,
  matched: [],
  post: {
    id: `review-${n}`,
    platform: 'twitter',
    author: `review${n}`,
    authorName: `Review ${n}`,
    authorProfileImageUrl: null,
    text: `Review caption ${n}`,
    tweetUrl: `https://x.com/review${n}/status/${n}`,
    processedAt: '2026-10-21T09:00:00Z',
    isArchived: false,
    links: null,
    tags: [],
    media: [
      {
        id: `media-${n}`,
        mediaType: 'video',
        width: 320,
        height: 240,
        durationMs: 4000,
        url: `/api/files/twitter/review-${n}/video-1`,
        thumbnailUrl: null,
      },
    ],
  },
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`reactions paging and original sheet hold the real video at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport)
    await page.route('**/api/posts/reacted?*', (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0)
      return route.fulfill({
        json: {
          name: 'Reactions',
          items: offset === 0 ? Array.from({ length: 50 }, (_, i) => item(i + 1)) : [item(51)],
          total: 51,
          nextOffset: offset === 0 ? 50 : null,
        },
      })
    })
    await page.route('**/api/files/twitter/review-*/video-1*', (route) =>
      route.fulfill({ contentType: 'video/webm', body: clip }),
    )
    await page.route('**/api/activity/processing/posts?*', (route) =>
      route.fulfill({ json: { posts: [] } }),
    )
    await page.goto('/play?reacted=1&start=twitter:review-50')
    const video = page.locator('video').first()
    await expect(video).toBeVisible()
    await video.evaluate(async (element) => {
      const v = element as HTMLVideoElement
      v.loop = true
      v.currentTime = 0
      await v.play()
      ;(window as unknown as { reviewVideo: HTMLVideoElement }).reviewVideo = v
    })
    await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(false)
    await page.getByRole('button', { name: 'The original post on X', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'The original post on X' })
    await expect(sheet.getByText('Review 50', { exact: true })).toBeVisible()
    await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(true)
    await video.evaluate((v) => v.dispatchEvent(new Event('ended')))
    await expect(sheet.getByText('Review caption 50', { exact: true })).toBeVisible()
    expect(
      await video.evaluate(
        (v) => v === (window as unknown as { reviewVideo: HTMLVideoElement }).reviewVideo,
      ),
    ).toBe(true)
    await page.screenshot({ path: `/tmp/adhx-nine-${info.project.name}-${viewport.width}.png` })
    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(sheet).toBeHidden()
    await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(false)
    await page.keyboard.press('ArrowRight')
    await expect(
      page
        .getByRole('region', { name: 'Now playing' })
        .getByRole('heading', { name: 'Review caption 51', exact: true }),
    ).toBeAttached()
    expect(
      await video.evaluate(
        (v) => v === (window as unknown as { reviewVideo: HTMLVideoElement }).reviewVideo,
      ),
    ).toBe(true)
  })
}
