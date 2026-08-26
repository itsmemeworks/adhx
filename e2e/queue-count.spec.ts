import { expect, test } from '@playwright/test'
import { E2E_USERNAME, PLAYLIST_TAG, POST } from './constants'
import {
  authedTest,
  expectTheaterReady,
  goNext,
  readQueueProgress,
  visibleQueueCount,
} from './helpers'

test.describe('queue count — Live LIFO', () => {
  test('starts at N in queue, Next shrinks remaining, Keep playing is N on repeat', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('adhx-theater-repeat')
      localStorage.removeItem('adhx-seen-v1')
    })
    await page.goto('/')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Stop when caught up' })).toBeVisible()

    // Repeat-off copy is unseen remaining.
    await expect(visibleQueueCount(page)).toHaveText(/\d+ in queue/)
    const start = await readQueueProgress(page)
    expect(start.played).toBe(0)
    expect(start.toPlay).toBeGreaterThan(1)

    await goNext(page)
    await expect(visibleQueueCount(page)).toHaveText(`${start.toPlay - 1} in queue`)
    await page.getByRole('button', { name: 'Queue', exact: true }).click()
    const liveQueue = page.getByRole('dialog', { name: 'Playlist' })
    await expect(liveQueue.getByText('Now playing', { exact: true })).toBeVisible()
    await expect(liveQueue.getByText('Next', { exact: true })).toBeVisible()
    await expect(liveQueue.getByText('Seen', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Stop when caught up' }).click()
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    await expect(visibleQueueCount(page)).toHaveText(/\d+ on repeat/)

    await page.getByRole('button', { name: 'Keep playing' }).click()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()
    await expect(visibleQueueCount(page)).toHaveText('1 on repeat')
  })
})

authedTest.describe('queue count — Saved one-pass vs loop', () => {
  authedTest('Keep playing is the pile; Play once is unseen remaining', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('adhx-theater-repeat-saved')
    })
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    await expect(visibleQueueCount(page)).toHaveText(/\d+ on repeat/)

    await page.getByRole('button', { name: 'Keep playing' }).click()
    await expect(page.getByRole('button', { name: 'Repeat this post' })).toBeVisible()
    await expect(visibleQueueCount(page)).toHaveText('1 on repeat')
    await page.getByRole('button', { name: 'Repeat this post' }).click()
    await expect(page.getByRole('button', { name: 'Play once' })).toBeVisible()

    const start = await readQueueProgress(page)
    expect(start.played).toBe(0)
    expect(start.toPlay).toBeGreaterThan(1)
    await expect(visibleQueueCount(page)).toHaveText(`${start.toPlay} in queue`)

    await goNext(page)
    await expect(visibleQueueCount(page)).toHaveText(`${start.toPlay - 1} in queue`)
  })

  authedTest('Videos filter names the video pile, not the full Saved list', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('adhx-theater-repeat-saved')
      localStorage.removeItem('adhx-theater-types')
    })
    await page.goto('/saved')
    await expectTheaterReady(page)
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeVisible()
    const all = await visibleQueueCount(page).innerText()
    const allN = Number(all.match(/(\d+) on repeat/)?.[1])
    expect(allN).toBeGreaterThan(1)

    const queue = page.getByRole('dialog', { name: 'Playlist' })
    await page.getByRole('button', { name: 'Queue', exact: true }).click()
    await expect(queue).toBeVisible()
    await queue.getByRole('button', { name: 'Videos', exact: true }).click()
    await expect(queue.getByRole('button', { name: 'Videos', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const filtered = await visibleQueueCount(page).innerText()
    const videoN = Number(filtered.match(/(\d+) on repeat/)?.[1])
    expect(videoN).toBeGreaterThan(0)
    expect(videoN).toBeLessThan(allN)
  })
})

test.describe('queue count — playlist loop', () => {
  test('a looping playlist shows N on repeat', async ({ page }) => {
    await page.goto(`/t/${E2E_USERNAME}/${PLAYLIST_TAG}`)
    await expectTheaterReady(page)
    await expect(visibleQueueCount(page)).toHaveText('3 on repeat')
  })
})

test.describe('preview Queue heading', () => {
  test('the opened post is Now playing, not This post / Shared post', async ({ page }) => {
    await page.goto(`/${POST.preview.author}/status/${POST.preview.id}`)
    await expectTheaterReady(page)
    await page.getByRole('button', { name: 'Queue', exact: true }).click()
    const queue = page.getByRole('dialog', { name: 'Playlist' })
    await expect(queue).toBeVisible()
    await expect(queue.getByText('Now playing', { exact: true })).toBeVisible()
    await expect(queue.getByText('Next', { exact: true })).toBeVisible()
    await expect(
      queue.locator(
        `[data-theater-queue-item][data-theater-item-key="twitter:${POST.preview.id}"]`,
      ),
    ).toHaveAttribute('aria-current', 'true')
    await expect(queue.getByText('This post', { exact: true })).toHaveCount(0)
    await expect(queue.getByText('Shared post', { exact: true })).toHaveCount(0)
  })
})
