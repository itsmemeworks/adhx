import { expect, type Page } from '@playwright/test'
import { ADD_TEXT, ADD_VIDEO, ADD_VIDEO_B, POST } from './constants'
import {
  apiAddByUrl,
  authedTest,
  broadcastAdded,
  deleteUserBookmark,
  expectTheaterReady,
  fetchFeedItem,
  goNext,
  openTheaterQueue,
  pasteTheaterLink,
  visibleCaption,
} from './helpers'

const ADD_IDS = [ADD_TEXT.id, ADD_VIDEO.id, ADD_VIDEO_B.id]

function tweetUrl(post: { author: string; id: string }): string {
  return `https://x.com/${post.author}/status/${post.id}`
}

function tiktokUrl(post: { author: string; id: string }): string {
  return `https://www.tiktok.com/@${post.author}/video/${post.id}`
}

async function addAndBroadcast(page: Page, url: string): Promise<void> {
  const { id, platform } = await apiAddByUrl(page, url)
  const item = await fetchFeedItem(page, id, platform)
  await broadcastAdded(page, item)
}

async function playUntilCaughtUp(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await page.getByText(/all caught up/i).isVisible()) return
    const next = page.getByRole('button', { name: 'Next post' })
    if (await next.isDisabled()) {
      await page.waitForTimeout(250)
      continue
    }
    await goNext(page)
  }
  await expect(page.getByText(/all caught up/i)).toBeVisible()
}

authedTest.describe('theater cross-tab add', () => {
  authedTest.afterEach(() => {
    for (const id of ADD_IDS) {
      deleteUserBookmark(id, 'twitter')
      deleteUserBookmark(id, 'tiktok')
    }
  })

  authedTest(
    'Saved: a second window add prepends and leaves the current post + Keep playing',
    async ({ page, context }) => {
      await page.goto('/saved')
      await expectTheaterReady(page)
      await expect(visibleCaption(page, POST.alpha.text)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
      const queue = await openTheaterQueue(page)

      const actor = await context.newPage()
      await actor.goto('/live')
      await expectTheaterReady(actor)
      await pasteTheaterLink(actor, tweetUrl(ADD_TEXT))

      await expect(queue.getByText(ADD_TEXT.text)).toBeVisible({ timeout: 20_000 })
      await expect(visibleCaption(page, POST.alpha.text)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
      await expect(queue.getByText('New since you opened')).toHaveCount(0)
      const added = queue.locator('[data-theater-queue-item]').filter({ hasText: ADD_TEXT.text })
      await expect(added).toBeVisible()
      await expect(added.getByTitle('Watched')).toHaveCount(0)
      await actor.close()
    },
  )

  authedTest('Saved: Videos + a text add from another window resets to All', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    const queue = await openTheaterQueue(page)
    await queue.getByRole('button', { name: 'Videos', exact: true }).click()
    await expect(queue.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await addAndBroadcast(page, tweetUrl(ADD_TEXT))

    await expect(queue.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(queue.getByText(ADD_TEXT.text)).toBeVisible()
    await expect(visibleCaption(page, POST.alpha.text)).toBeVisible()
  })

  authedTest(
    'Saved: Videos + a matching video add keeps the filter and stages the new save',
    async ({ page }) => {
      await page.goto('/saved')
      await expectTheaterReady(page)
      const queue = await openTheaterQueue(page)
      await queue.getByRole('button', { name: 'Videos', exact: true }).click()

      await addAndBroadcast(page, tiktokUrl(ADD_VIDEO))

      await expect(queue.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(queue.getByText(ADD_VIDEO.text)).toBeVisible()
      await expect(visibleCaption(page, ADD_VIDEO.text)).toBeVisible()
    },
  )

  authedTest(
    'Live: caught-up + a second-window add plays New since you opened',
    async ({ page }) => {
      await page.goto('/live')
      await expectTheaterReady(page)
      await playUntilCaughtUp(page)
      const queue = await openTheaterQueue(page)
      await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()

      await addAndBroadcast(page, tweetUrl(ADD_TEXT))

      await expect(page.getByText(/all caught up/i)).toHaveCount(0)
      await expect(queue.getByText('New since you opened')).toBeVisible()
      await expect(queue.getByText(ADD_TEXT.text)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()
    },
  )

  authedTest('Live: Videos + a text add from another window resets to All', async ({ page }) => {
    await page.goto('/live')
    await expectTheaterReady(page)
    const queue = await openTheaterQueue(page)
    await queue.getByRole('button', { name: 'Videos', exact: true }).click()
    await expect(queue.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await addAndBroadcast(page, tweetUrl(ADD_TEXT))

    await expect(queue.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(queue.getByText(ADD_TEXT.text)).toBeVisible()
  })

  authedTest(
    'Live: Videos + a matching video add keeps Videos and groups the arrival',
    async ({ page }) => {
      await page.goto('/live')
      await expectTheaterReady(page)
      await playUntilCaughtUp(page)
      const queue = await openTheaterQueue(page)
      await queue.getByRole('button', { name: 'Videos', exact: true }).click()

      await addAndBroadcast(page, tiktokUrl(ADD_VIDEO))

      await expect(queue.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(queue.getByText(ADD_VIDEO.text)).toBeVisible()
      await expect(queue.getByText('New since you opened')).toBeVisible()
      await expect(page.getByText(/all caught up/i)).toHaveCount(0)
    },
  )

  authedTest(
    'Live: mid-play matching add stays on the current post and groups under New',
    async ({ page }) => {
      await page.goto('/live')
      await expectTheaterReady(page)
      const queue = await openTheaterQueue(page)
      const playing = queue.locator('[data-theater-queue-item][aria-current="true"]')
      const playingText = (await playing.locator('p').innerText()).trim()
      const pause = page.getByRole('button', { name: 'Pause' })
      if (await pause.isVisible()) await pause.click()
      await addAndBroadcast(page, tweetUrl(ADD_TEXT))

      await expect(queue.getByText(ADD_TEXT.text)).toBeVisible()
      await expect(queue.getByText('New since you opened')).toBeVisible()
      const added = queue.locator('[data-theater-queue-item]').filter({ hasText: ADD_TEXT.text })
      await expect(added).not.toHaveAttribute('aria-current', 'true')
      await expect(queue.locator('[data-theater-queue-item][aria-current="true"]')).toContainText(
        playingText,
      )
      await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()
    },
  )

  authedTest(
    'Saved: Next then a second-window add marks the left post Watched, not the arrival',
    async ({ page }) => {
      await page.goto('/saved')
      await expectTheaterReady(page)
      await goNext(page)
      await expect(visibleCaption(page, POST.bravo.text)).toBeVisible()
      const queue = await openTheaterQueue(page)

      await addAndBroadcast(page, tweetUrl(ADD_TEXT))

      const added = queue.locator('[data-theater-queue-item]').filter({ hasText: ADD_TEXT.text })
      await expect(added).toBeVisible()
      await expect(added.getByTitle('Watched')).toHaveCount(0)
      await expect(
        queue
          .locator('[data-theater-queue-item]')
          .filter({ hasText: POST.alpha.text })
          .getByTitle('Watched'),
      ).toBeVisible()
      await expect(visibleCaption(page, POST.bravo.text)).toBeVisible()
      await expect(queue.getByText('New since you opened')).toHaveCount(0)
    },
  )

  authedTest(
    'Saved: Videos + a second matching add stays on the playing video',
    async ({ page }) => {
      await page.goto('/saved')
      await expectTheaterReady(page)
      const queue = await openTheaterQueue(page)
      await queue.getByRole('button', { name: 'Videos', exact: true }).click()
      await addAndBroadcast(page, tiktokUrl(ADD_VIDEO))
      await expect(visibleCaption(page, ADD_VIDEO.text)).toBeVisible()

      await addAndBroadcast(page, tiktokUrl(ADD_VIDEO_B))

      await expect(queue.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(visibleCaption(page, ADD_VIDEO.text)).toBeVisible()
      const arrival = queue
        .locator('[data-theater-queue-item]')
        .filter({ hasText: ADD_VIDEO_B.text })
      await expect(arrival).toBeVisible()
      await expect(arrival).not.toHaveAttribute('aria-current', 'true')
      await expect(arrival.getByTitle('Watched')).toHaveCount(0)
    },
  )

  authedTest('Saved Play once: a remote add keeps Play once', async ({ page }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Keep playing' }).click()
    await page.getByRole('button', { name: 'Repeat this post' }).click()
    await expect(page.getByRole('button', { name: 'Play once' })).toBeVisible()

    await addAndBroadcast(page, tweetUrl(ADD_TEXT))

    await expect(page.getByRole('button', { name: 'Play once' })).toBeVisible()
    await expect(visibleCaption(page, POST.alpha.text)).toBeVisible()
  })

  authedTest('Live paste in a second window keeps the Saved cursor', async ({ page, context }) => {
    await page.goto('/saved')
    await expectTheaterReady(page)
    await goNext(page)
    await expect(visibleCaption(page, POST.bravo.text)).toBeVisible()
    const queue = await openTheaterQueue(page)

    const actor = await context.newPage()
    await actor.goto('/live')
    await expectTheaterReady(actor)
    await pasteTheaterLink(actor, tweetUrl(ADD_TEXT))

    await expect(visibleCaption(page, POST.bravo.text)).toBeVisible({ timeout: 20_000 })
    await expect(queue.getByText(ADD_TEXT.text)).toBeVisible({ timeout: 20_000 })
    await expect(
      queue.locator('[data-theater-queue-item]').filter({ hasText: ADD_TEXT.text }),
    ).not.toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    await actor.close()
  })
})
