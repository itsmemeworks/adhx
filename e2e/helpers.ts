import { expect, test as base, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import Database from 'better-sqlite3'
import { E2E_DB_PATH } from './env'
import {
  E2E_ORIGIN,
  E2E_SESSION_SECRET,
  E2E_USER_ID,
  E2E_USERNAME,
  PRIVATE_TAG,
  TMP_TAG,
} from './constants'

export async function mintSessionCookie(
  user: { userId?: string; username?: string } = {},
): Promise<string> {
  return new SignJWT({
    userId: user.userId ?? E2E_USER_ID,
    username: user.username ?? E2E_USERNAME,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(E2E_SESSION_SECRET))
}

export async function addSessionCookie(
  page: Page,
  user: { userId?: string; username?: string } = {},
): Promise<void> {
  const value = await mintSessionCookie(user)
  await page.context().addCookies([
    {
      name: 'adhx_session',
      value,
      url: E2E_ORIGIN,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

/** Theater chrome is desktop-only at lg+. Do not press Escape — on the
 * personal theater it means Close and dumps you on `/library`. */
export async function expectTheaterReady(page: Page): Promise<void> {
  const next = page.getByRole('button', { name: 'Next post' })
  await expect(next).toBeVisible({ timeout: 30_000 })
  // All Clear keeps Next mounted (disabled). A Live→Saved local flip uses
  // an empty mount snapshot, so "visible Next" alone is not a playing stage.
  await expect(next).toBeEnabled({ timeout: 30_000 })
  // First paint is currentKey=null ("Nothing playing") until the land-on-first
  // effect runs. If that never happens, hydration failed (or the queue is empty).
  await expect(page.getByText('Nothing playing')).toHaveCount(0, { timeout: 15_000 })
}

export async function goNext(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next post' }).click()
}

/** Stop auto-advance so a mid-test add does not race the 10s dwell. */
export async function pauseTheater(page: Page): Promise<void> {
  const pause = page.getByRole('button', { name: 'Pause' })
  if (await pause.isVisible()) await pause.click()
}

/** Caption text is also in the dock / SEO list — never assert it as a singleton. */
export function caption(page: Page, text: string) {
  return page.getByText(text, { exact: true }).first()
}

/** Same copy as {@link caption}, but skip the CSS-hidden mobile queue. */
export function visibleCaption(page: Page, text: string) {
  return page.getByText(text, { exact: true }).locator('visible=true').first()
}

/** Visible Read / Watch pill — not the tappable caption, not the CSS-hidden chrome copy. */
export function readToggle(page: Page) {
  return page.locator('[data-theater-action="read"]').locator('visible=true').first()
}

export async function expectSignInModal(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Email me a magic link' })).toBeVisible()
}

export function countActivity(action: string): number {
  const sqlite = new Database(E2E_DB_PATH, { readonly: true })
  try {
    const row = sqlite
      .prepare('SELECT COUNT(*) AS n FROM activity WHERE action = ?')
      .get(action) as {
      n: number
    }
    return row.n
  } finally {
    sqlite.close()
  }
}

export function clearArchives(): void {
  withDb((sqlite) => {
    sqlite.prepare('DELETE FROM archived_posts WHERE user_id = ?').run(E2E_USER_ID)
  })
}

function withDb<T>(fn: (sqlite: InstanceType<typeof Database>) => T): T {
  const sqlite = new Database(E2E_DB_PATH)
  try {
    return fn(sqlite)
  } finally {
    sqlite.close()
  }
}

/** Insert a pulse row the Live theater will pick up on the next /api/activity poll. */
export function insertLivePulse(opts: {
  id: string
  author: string
  authorName: string
  text: string
  contentType: 'video' | 'photo' | 'text' | 'article'
  platform?: string
  url?: string
}): void {
  withDb((sqlite) => {
    sqlite
      .prepare(
        `INSERT INTO activity (
          action, platform, bookmark_id, author, author_name, text, url, content_type, created_at, hidden
        ) VALUES ('preview', ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        opts.platform ?? 'twitter',
        opts.id,
        opts.author,
        opts.authorName,
        opts.text,
        opts.url ?? `/${opts.author}/status/${opts.id}`,
        opts.contentType,
        new Date(Date.now() + 15_000).toISOString(),
      )
  })
}

export function deleteLivePulse(ids: string[]): void {
  if (ids.length === 0) return
  withDb((sqlite) => {
    const placeholders = ids.map(() => '?').join(',')
    sqlite.prepare(`DELETE FROM activity WHERE bookmark_id IN (${placeholders})`).run(...ids)
  })
}

/** Same-process assertions — a second sqlite connection can miss WAL writes. */
export async function feedHasId(page: Page, id: string, platform = 'twitter'): Promise<boolean> {
  const res = await page.request.get(`/api/feed?id=${id}&idPlatform=${platform}&hideArchived=false`)
  if (!res.ok()) return false
  const body = (await res.json()) as { items?: Array<{ id: string; platform?: string }> }
  return (body.items ?? []).some((i) => i.id === id && (i.platform ?? 'twitter') === platform)
}

export async function listTags(page: Page): Promise<Array<{ tag: string; isPublic?: boolean }>> {
  const res = await page.request.get('/api/tags')
  if (!res.ok()) return []
  const body = (await res.json()) as { tags?: Array<{ tag: string; isPublic?: boolean }> }
  return body.tags ?? []
}

export async function tagsNamed(page: Page): Promise<string[]> {
  return (await listTags(page)).map((t) => t.tag)
}

export async function tagIsPublic(page: Page, tag: string): Promise<boolean> {
  return (await listTags(page)).some((t) => t.tag === tag && t.isPublic)
}

export async function apiDeleteBookmark(
  page: Page,
  id: string,
  platform = 'twitter',
): Promise<void> {
  await page.request.delete(`/api/bookmarks/${id}?platform=${platform}`)
}

export async function apiDeleteTag(page: Page, tag: string): Promise<void> {
  await page.request.delete('/api/tags', { data: { tag } })
}

export async function apiSetTagPublic(page: Page, tag: string, isPublic: boolean): Promise<void> {
  await page.request.patch('/api/tags', { data: { tag, isPublic } })
}

export async function apiUnarchive(page: Page, id: string, platform = 'twitter'): Promise<void> {
  await page.request.delete(`/api/bookmarks/${id}/read?platform=${platform}`)
}

export function deleteUserBookmark(id: string, platform = 'twitter', userId = E2E_USER_ID): void {
  withDb((sqlite) => {
    sqlite
      .prepare('DELETE FROM bookmark_tags WHERE user_id = ? AND platform = ? AND bookmark_id = ?')
      .run(userId, platform, id)
    sqlite
      .prepare('DELETE FROM bookmark_media WHERE user_id = ? AND platform = ? AND bookmark_id = ?')
      .run(userId, platform, id)
    sqlite
      .prepare('DELETE FROM bookmark_links WHERE user_id = ? AND platform = ? AND bookmark_id = ?')
      .run(userId, platform, id)
    sqlite
      .prepare('DELETE FROM archived_posts WHERE user_id = ? AND platform = ? AND bookmark_id = ?')
      .run(userId, platform, id)
    sqlite
      .prepare('DELETE FROM bookmarks WHERE user_id = ? AND platform = ? AND id = ?')
      .run(userId, platform, id)
  })
}

export function deleteUserTag(tag: string, userId = E2E_USER_ID): void {
  withDb((sqlite) => {
    sqlite.prepare('DELETE FROM bookmark_tags WHERE user_id = ? AND tag = ?').run(userId, tag)
    sqlite.prepare('DELETE FROM tag_shares WHERE user_id = ? AND tag = ?').run(userId, tag)
  })
}

export function setTagPublic(tag: string, isPublic: boolean, userId = E2E_USER_ID): void {
  withDb((sqlite) => {
    sqlite
      .prepare('UPDATE tag_shares SET is_public = ? WHERE user_id = ? AND tag = ?')
      .run(isPublic ? 1 : 0, userId, tag)
  })
}

export function sqliteTagIsPublic(tag: string, userId = E2E_USER_ID): boolean {
  return withDb((sqlite) => {
    const row = sqlite
      .prepare('SELECT is_public AS n FROM tag_shares WHERE user_id = ? AND tag = ?')
      .get(userId, tag) as { n: number } | undefined
    return Boolean(row?.n)
  })
}

/** Undo leftover mutation from a failed tag / save / clone / visibility test. */
export function resetMutableE2eState(): void {
  deleteUserTag(TMP_TAG)
  setTagPublic(PRIVATE_TAG, false)
  clearArchives()
}

export const authedTest = base.extend({
  page: async ({ page }, use) => {
    await addSessionCookie(page)
    await use(page)
  },
})

/** Desktop dock count — mobile peek stays mounted (`lg:hidden`) with the same hook. */
export function visibleQueueCount(page: Page) {
  return page.locator('[data-theater-queue-count]').locator('visible=true')
}

export async function apiAddByUrl(
  page: Page,
  url: string,
): Promise<{ id: string; platform: string }> {
  const res = await page.request.post('/api/bookmarks/add', {
    data: { url, source: 'manual' },
  })
  if (!res.ok()) throw new Error(`add failed ${res.status()}`)
  const body = (await res.json()) as { bookmark?: { id?: string }; platform?: string }
  const id = body.bookmark?.id
  if (!id) throw new Error('add returned no bookmark id')
  return { id, platform: body.platform ?? 'twitter' }
}

export async function fetchFeedItem(
  page: Page,
  id: string,
  platform = 'twitter',
): Promise<Record<string, unknown>> {
  const res = await page.request.get(`/api/feed?id=${id}&idPlatform=${platform}&hideArchived=false`)
  if (!res.ok()) throw new Error(`feed lookup failed ${res.status()}`)
  const body = (await res.json()) as { items?: Array<Record<string, unknown>> }
  const item = (body.items ?? []).find((row) => row.id === id)
  if (!item) throw new Error(`feed missing ${platform}:${id}`)
  return item
}

/** Other-window path: BroadcastChannel → local tweet-added (AppShell bridge). */
export async function broadcastAdded(page: Page, added: Record<string, unknown>): Promise<void> {
  await page.evaluate((item) => {
    new BroadcastChannel('adhx-client-events').postMessage({
      name: 'tweet-added',
      detail: { added: item },
    })
  }, added)
}

export async function openTheaterQueue(page: Page) {
  const queueBtn = page.getByRole('button', { name: 'Queue', exact: true }).locator('visible=true')
  if ((await queueBtn.getAttribute('aria-expanded')) !== 'true') {
    await queueBtn.click()
  }
  return page.getByRole('dialog', { name: 'Playlist' }).locator('visible=true')
}

export async function pasteTheaterLink(page: Page, url: string): Promise<void> {
  await page.getByRole('button', { name: 'Paste a link' }).click()
  const field = page.getByRole('textbox', { name: /Paste a link/i })
  await field.fill(url)
  await field.press('Enter')
}

export async function readQueueProgress(page: Page): Promise<{ played: number; toPlay: number }> {
  const text = (await visibleQueueCount(page).innerText()).replace(/\s+/g, ' ').trim()
  const ofMatch = text.match(/^(\d+) of (\d+)/)
  if (ofMatch) return { played: Number(ofMatch[1]), toPlay: Number(ofMatch[2]) }
  const queueMatch = text.match(/^(\d+) in queue/)
  if (queueMatch) return { played: 0, toPlay: Number(queueMatch[1]) }
  throw new Error(`expected "N in queue" or "N of M" queue count, got "${text}"`)
}
