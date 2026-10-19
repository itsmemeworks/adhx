import { expect, test, type Browser, type Page } from '@playwright/test'
import { E2E_ORIGIN, FROG_LIVE, FROG_TITLE, FROG_TUNE_IN } from './constants'
import {
  addSessionCookie,
  apiAddByUrl,
  deleteLivePulse,
  deleteUser,
  deleteUserBookmark,
  insertUser,
} from './helpers'

/**
 * "Right now", live across two accounts: one watches, the other saves a post
 * that belongs to the seeded "Frog" moment (e2e/seed.ts gives every post a
 * synthetic vector, since no model runs here). The watcher's screen updates
 * over SSE without a reload.
 */

test.describe.configure({ mode: 'serial' })
// First visits compile /now, /play and /moments in `next dev`.
test.slow()

async function signedInPage(
  browser: Browser,
  user?: { userId: string; username: string },
): Promise<Page> {
  const context = await browser.newContext({ baseURL: E2E_ORIGIN })
  const page = await context.newPage()
  await addSessionCookie(page, user)
  return page
}

/** Resolves once the page's live stream is subscribed on the server. */
function streamOpened(page: Page) {
  return page.waitForResponse((r) => r.url().includes('/api/moments/stream'))
}

function tweetUrl(post: { author: string; id: string }) {
  return `https://x.com/${post.author}/status/${post.id}`
}

let watcher: Page
let saver: Page
let saverId: string

// The engine remembers who saved what for as long as the server runs, so
// each attempt (a retry, --repeat-each) saves as someone new.
test.beforeEach(async ({ browser }, testInfo) => {
  const tag = `${Date.now().toString(36)}${testInfo.retry}${testInfo.repeatEachIndex}`
  saverId = `e2e-saver-${tag}`
  insertUser(saverId, `e2esaver${tag}`)
  watcher = await signedInPage(browser)
  saver = await signedInPage(browser, { userId: saverId, username: `e2esaver${tag}` })
})

test.afterEach(async () => {
  await watcher.context().close()
  await saver.context().close()
  // Saves write public pulses; keep them out of later Live-theater specs.
  deleteLivePulse([FROG_LIVE.id, FROG_TUNE_IN.id])
  for (const post of [FROG_LIVE, FROG_TUNE_IN]) deleteUserBookmark(post.id, 'twitter', saverId)
  deleteUser(saverId)
})

test('a save by someone else lands in the moment on Right now', async () => {
  const opened = streamOpened(watcher)
  await watcher.goto('/now')
  const card = watcher.locator('article').filter({
    has: watcher.getByRole('heading', { name: FROG_TITLE, exact: true }),
  })
  await expect(card).toBeVisible({ timeout: 60_000 })
  // Two seeded people on a fresh server; more after a retry.
  const people = card.getByText(/^\d+ people$/)
  const before = Number.parseInt(await people.innerText(), 10)
  expect(before).toBeGreaterThanOrEqual(2)
  // The "Just saved" strip, newest first (keeps earlier attempts' saves).
  const strip = watcher.locator('ul[aria-live="polite"] > li')
  const chips = strip.filter({ hasText: FROG_LIVE.text })
  const chipsBefore = await chips.count()
  await opened

  // The card's "Just saved" overlay only shows for a moment (FLASH_MS), so
  // watch for it from before the save instead of polling afterwards.
  const overlay = watcher.waitForFunction(
    (title) =>
      [...document.querySelectorAll('article')].some(
        (article) =>
          article.querySelector('h3')?.textContent === title &&
          [...article.querySelectorAll('span')].some((s) => s.textContent === 'Just saved'),
      ),
    FROG_TITLE,
    { polling: 50, timeout: 30_000 },
  )

  await apiAddByUrl(saver, tweetUrl(FROG_LIVE))

  await overlay
  await expect(chips).toHaveCount(chipsBefore + 1)
  await expect(strip.first()).toContainText(FROG_LIVE.text)
  await expect(strip.first()).toContainText(`→ ${FROG_TITLE}`)
  await expect(people).toHaveText(`${before + 1} people`)
})

test('Tune in waits when caught up, then plays the next save as it lands', async () => {
  const opened = streamOpened(watcher)
  await watcher.goto('/now')
  const tuneIn = watcher
    .locator('article')
    .filter({ has: watcher.getByRole('heading', { name: FROG_TITLE, exact: true }) })
    .getByRole('link', { name: 'Tune in' })
  await expect(tuneIn).toBeVisible({ timeout: 60_000 })
  const href = await tuneIn.getAttribute('href')
  const slug = new URL(href ?? '', E2E_ORIGIN).searchParams.get('moment')
  expect(slug).toBeTruthy()
  await opened

  const tuned = streamOpened(watcher)
  await watcher.goto(`/play?moment=${slug}`)
  await tuned
  await expect(watcher.getByText('1 watching', { exact: true })).toBeVisible({ timeout: 60_000 })

  // Another viewer on the moment's page counts as watching too.
  const viewing = streamOpened(saver)
  await saver.goto(`/moments/${slug}`)
  await viewing
  await expect(watcher.getByText('2 watching', { exact: true })).toBeVisible()

  // Skip to the end of the moment's saves.
  const caughtUp = watcher.getByText('You’re all caught up')
  const next = watcher.getByRole('button', { name: 'Next', exact: true })
  for (let i = 0; i < 20 && !(await caughtUp.isVisible()); i++) {
    await next.click()
  }
  await expect(caughtUp).toBeVisible()

  await apiAddByUrl(saver, tweetUrl(FROG_TUNE_IN))

  await expect(caughtUp).toBeHidden()
  await expect(watcher.getByText(FROG_TUNE_IN.text).first()).toBeVisible()
  await expect(watcher.getByText('Just saved · just now').first()).toBeVisible()
})
