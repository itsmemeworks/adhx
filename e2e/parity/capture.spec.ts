/**
 * Screenshot every web design board (`j*-web-*`) from the parity server,
 * signed in as the board's member and put into the board's state where the
 * app allows it. Run with `pnpm parity:capture` (needs `pnpm parity:serve`,
 * or starts it).
 *
 * Outputs (per Playwright project: `web` = the board's 1280×800, `web-mobile`
 * = 390×844):
 *   .out/<project>/<board>.png
 *   .out/<project>/<board>.json  what was reached and what wasn't
 *
 * Captures never change what the server remembers as seen: `/api/views` is
 * answered in the browser. Invite links are mocked the same way.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { test, type APIRequestContext, type Page } from '@playwright/test'
import { PARITY_CREDENTIALS, PARITY_ORIGIN, PARITY_OUT } from './env'
import { POSTS, type PersonKey } from './world'

interface Member {
  userId: string
  username: string
  session: string
  cookie: string
  phoneKey: string
}
interface Credentials {
  server: string
  members: Record<PersonKey, Member>
}

function credentials(): Credentials {
  return JSON.parse(fs.readFileSync(PARITY_CREDENTIALS, 'utf8')) as Credentials
}

interface Ctx {
  page: Page
  mobile: boolean
  creds: Credentials
  request: APIRequestContext
  /** Note a board state the capture couldn't reach (the shot is still taken). */
  miss: (what: string) => void
  /** Note a board state the capture did reach. */
  hit: (what: string) => void
  /** Run on teardown (close streams …). */
  cleanup: (fn: () => void) => void
}

interface Board {
  name: string
  as: PersonKey
  /** What the board shows, for the report. */
  shows: string
  path: string | ((ctx: Ctx) => Promise<string>)
  /** Before the page loads (init scripts, routes). */
  init?: (ctx: Ctx) => Promise<void>
  setup?: (ctx: Ctx) => Promise<void>
  /** Right before the screenshot, after media is settled (for things that fade, like reactions). */
  beforeShot?: (ctx: Ctx) => Promise<void>
  /** Seek playing videos here (seconds) so frames are stable. */
  seek?: number
  /** The phone board closest to this screen, compared with the web-mobile capture. */
  phone?: string
  /** States the app can't show from seeded data alone. */
  known?: string[]
}

// ——— helpers ———

async function attempt(ctx: Ctx, what: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    ctx.hit(what)
    return true
  } catch (error) {
    ctx.miss(
      `${what}: ${String((error as Error).message ?? error)
        .split('\n')[0]
        .slice(0, 160)}`,
    )
    return false
  }
}

async function theaterReady(page: Page): Promise<void> {
  await page.locator('[data-app-account-scope="trusted"]').first().waitFor({ timeout: 45_000 })
  // The stage's action rail (Save, Share, Download, More).
  await page.getByRole('navigation', { name: 'Post actions' }).first().waitFor({ timeout: 45_000 })
}

/** Click the first visible element whose accessible name or text matches. */
async function clickText(page: Page, text: string | RegExp, timeout = 15_000): Promise<void> {
  const byRole = page.getByRole('button', { name: text }).locator('visible=true').first()
  if (await byRole.count()) {
    await byRole.click({ timeout })
    return
  }
  await page.getByText(text).locator('visible=true').first().click({ timeout })
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Is a post with this title on stage (its caption visible, outside any sheet)? */
async function onStage(page: Page, title: string): Promise<boolean> {
  return page.evaluate((t) => {
    const needle = t.toLowerCase()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!el || !n.textContent?.toLowerCase().includes(needle)) continue
      if (el.closest('[role="dialog"], ul, ol, nav, header, aside')) continue
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (
        r.width > 0 &&
        r.height > 0 &&
        style.visibility !== 'hidden' &&
        r.bottom > 0 &&
        r.top < innerHeight
      )
        return true
    }
    return false
  }, title)
}

/** Put the queue item with this title on stage, through the Up next sheet. */
async function playItem(ctx: Ctx, title: string): Promise<void> {
  const { page } = ctx
  await attempt(ctx, `on stage: ${title}`, async () => {
    if (await onStage(page, title)) return
    // Wide screens list what's next beside the stage; phones open it from ⋯.
    const row = page
      .getByRole('button', { name: new RegExp(`^Play ${escapeRe(title)}`, 'i') })
      .locator('visible=true')
      .first()
    if (await row.count()) {
      await row.click()
      await page.waitForTimeout(1_200)
      if (!(await onStage(page, title))) throw new Error('picked from Up next but not on stage')
      return
    }
    const upNext = page
      .getByRole('button', { name: 'Up next', exact: true })
      .locator('visible=true')
    if (await upNext.count()) await upNext.first().click()
    else {
      await page
        .getByRole('button', { name: 'More options' })
        .locator('visible=true')
        .first()
        .click()
      await page.getByRole('menuitem', { name: 'Up next' }).first().click()
    }
    const tile = page
      .getByRole('button', { name: new RegExp(`^Play ${escapeRe(title)}`, 'i') })
      .locator('visible=true')
      .first()
    try {
      await tile.click({ timeout: 10_000 })
    } catch (error) {
      // Leave the stage as it was, not covered by the sheet.
      await page
        .getByRole('button', { name: 'Close' })
        .locator('visible=true')
        .first()
        .click()
        .catch(() => {})
      throw error
    }
    await page.waitForTimeout(1_200)
    if (!(await onStage(page, title))) throw new Error('picked from Up next but not on stage')
  })
}

/**
 * In this browser only: a post that was on its way the last time the theater
 * asked (`/api/activity/processing/posts`) is kept the next time, as if its
 * download had just finished. The server is never changed.
 */
async function keptOnNextLook(ctx: Ctx): Promise<void> {
  const seen = new Set<string>()
  await ctx.page.route('**/api/activity/processing/posts*', async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as {
      posts: Array<{ platform: string; id: string; state: string; [k: string]: unknown }>
      people: unknown[]
    }
    body.posts = body.posts.map((p) => {
      const key = `${p.platform}:${p.id}`
      if (!['waiting', 'keeping', 'converting'].includes(p.state)) return p
      if (!seen.has(key)) {
        seen.add(key)
        return p
      }
      return { ...p, state: 'kept', step: null, percent: null, keptAt: new Date().toISOString() }
    })
    await route.fulfill({ response: res, json: body })
  })
}

async function pausePlayback(page: Page): Promise<void> {
  const pause = page.getByRole('button', { name: 'Pause', exact: true }).locator('visible=true')
  if (await pause.count())
    await pause
      .first()
      .click({ timeout: 5_000 })
      .catch(() => {})
}

/** Pause every video, seek, and wait for a decoded frame. */
async function stabilizeMedia(page: Page, seek?: number): Promise<void> {
  await page
    .evaluate(async (t) => {
      const videos = [...document.querySelectorAll('video')]
      await Promise.all(
        videos.map(
          (v) =>
            new Promise<void>((resolve) => {
              const done = () => resolve()
              const timer = setTimeout(done, 8_000)
              const settle = () => {
                v.pause()
                if (typeof t === 'number' && Number.isFinite(v.duration) && v.duration > 0) {
                  const target = Math.min(t, Math.max(0, v.duration - 0.5))
                  if (Math.abs(v.currentTime - target) > 0.2) {
                    v.addEventListener('seeked', () => (clearTimeout(timer), done()), {
                      once: true,
                    })
                    v.currentTime = target
                    return
                  }
                }
                clearTimeout(timer)
                done()
              }
              if (v.readyState >= 2) settle()
              else v.addEventListener('loadeddata', settle, { once: true })
            }),
        ),
      )
    }, seek ?? null)
    .catch(() => {})
}

async function imagesLoaded(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => [...document.images].filter((i) => i.loading !== 'lazy').every((i) => i.complete),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {})
}

/** Keep a member "watching" a moment (their SSE stream), so names show for others. */
function watchMoment(ctx: Ctx, who: PersonKey, slug: string): void {
  const member = ctx.creds.members[who]
  const req = http.get(`${PARITY_ORIGIN}/api/moments/stream?watch=${encodeURIComponent(slug)}`, {
    headers: { Cookie: member.cookie, Accept: 'text/event-stream' },
  })
  req.on('response', (res) => res.resume())
  req.on('error', () => {})
  ctx.cleanup(() => req.destroy())
}

async function asMember(ctx: Ctx, who: PersonKey) {
  return ctx.request.storageState().then(() => ({
    Cookie: ctx.creds.members[who].cookie,
    'Content-Type': 'application/json',
    Origin: PARITY_ORIGIN,
  }))
}

interface MomentSummary {
  slug: string
  title: string
  people: number
}

async function babiesMoment(ctx: Ctx): Promise<MomentSummary | null> {
  const res = await ctx.request.get('/api/moments', {
    headers: { Cookie: ctx.creds.members.pete.cookie },
  })
  if (!res.ok()) return null
  const body = (await res.json()) as { moments: MomentSummary[] }
  return body.moments.find((m) => /bab/i.test(m.title)) ?? body.moments[0] ?? null
}

/** A seeded post's kept file (`.out/media/{platform}/{id}-…/{slot}`). */
function keptFile(key: string, slot: string): Buffer {
  const post = POSTS.find((p) => p.key === key)
  if (!post) throw new Error(`no seeded post ${key}`)
  const dir = path.join(PARITY_OUT, 'media', post.platform)
  const folder = fs.readdirSync(dir).find((f) => f.startsWith(`${post.id}-`))
  if (!folder) throw new Error(`no kept media for ${key}`)
  return fs.readFileSync(path.join(dir, folder, slot))
}

/**
 * In this browser only: remember every EventSource the page opens, so a
 * capture can play a stream event into it (`streamEvent`). The server's
 * stream is untouched.
 */
async function recordStreams(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __parityStreams: EventSource[]
      EventSource: typeof EventSource
    }
    w.__parityStreams = []
    const Native = w.EventSource
    w.EventSource = class extends Native {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init)
        w.__parityStreams.push(this)
      }
    }
  })
}

/** Play one event into the page's open streams whose address contains `match`. */
async function streamEvent(
  page: Page,
  match: string,
  type: string,
  data: unknown,
): Promise<number> {
  return page.evaluate(
    ({ match, type, json }) => {
      const streams =
        (window as unknown as { __parityStreams?: EventSource[] }).__parityStreams ?? []
      let n = 0
      for (const s of streams) {
        if (s.readyState === EventSource.CLOSED || !s.url.includes(match)) continue
        s.dispatchEvent(new MessageEvent(type, { data: json }))
        n++
      }
      return n
    },
    { match, type, json: JSON.stringify(data) },
  )
}

// ——— the boards ———

const BOARDS: Board[] = [
  {
    name: 'j1-4-web-getting-ready',
    as: 'pete',
    shows: 'My saves on the dark chocolate Reel while it is being kept (62%)',
    path: '/play?recent=1',
    seek: 4,
    setup: async (ctx) => {
      await attempt(ctx, 'theater ready', () => theaterReady(ctx.page))
      await playItem(ctx, 'Trying dark chocolate')
      // The seed keeps its job running at 62%, so the stage waits for the copy.
      await attempt(ctx, 'Getting it ready · 62%', async () => {
        await ctx.page.getByText('Getting it ready…').locator('visible=true').first().waitFor()
        await ctx.page.getByText('62%').locator('visible=true').first().waitFor()
      })
      await attempt(ctx, 'Shared with your people', () =>
        ctx.page.getByText('Shared with your people').locator('visible=true').first().waitFor(),
      )
    },
  },
  {
    name: 'j1-5-web-saved-menu',
    as: 'pete',
    shows: 'My saves, dark chocolate just kept and playing, ⋯ menu open',
    path: '/play?recent=1',
    seek: 4,
    setup: async (ctx) => {
      // The seed's copy of dark chocolate is still on its way (j1-4). In the
      // browser only, the next look after "Getting it ready" finds it kept,
      // so the real switch to playing (and "Kept on your ADHX") happens.
      await keptOnNextLook(ctx)
      await attempt(ctx, 'theater ready', () => theaterReady(ctx.page))
      await playItem(ctx, 'Trying dark chocolate')
      await attempt(ctx, 'Kept on your ADHX', () =>
        ctx.page
          .getByText('Kept on your ADHX')
          .locator('visible=true')
          .first()
          .waitFor({ timeout: 10_000 }),
      )
      await pausePlayback(ctx.page)
      await attempt(ctx, '⋯ menu open', () => clickText(ctx.page, 'More options'))
    },
  },
  {
    name: 'j2-5-web-new',
    as: 'pete',
    shows: 'New, Me at the zoo playing, 12 you haven’t seen',
    path: '/play?feed=new',
    seek: 7,
    phone: 'j2-1-phone-new',
    setup: async (ctx) => {
      await attempt(ctx, 'theater ready', () => theaterReady(ctx.page))
      // Phones are compared with j2-1, which plays an upright hamster video.
      await playItem(ctx, ctx.mobile ? 'Same baby, same hamster' : 'Me at the zoo')
      await pausePlayback(ctx.page)
    },
  },
  {
    name: 'j2-6-web-caught-up',
    as: 'pete',
    shows: 'New, the caught-up end card',
    path: '/play?feed=new',
    phone: 'j2-4-phone-caught-up',
    setup: async (ctx) => {
      const { page } = ctx
      await attempt(ctx, 'theater ready', () => theaterReady(page))
      await attempt(ctx, 'caught-up card', async () => {
        for (let i = 0; i < 30; i++) {
          if (await page.getByText('Go touch grass.').locator('visible=true').count()) return
          // → is Next (the theater's keys).
          await page.keyboard.press('ArrowRight')
          await page.waitForTimeout(500)
        }
        await page
          .getByText('Go touch grass.')
          .locator('visible=true')
          .first()
          .waitFor({ timeout: 10_000 })
      })
    },
  },
  {
    name: 'j3-1-web-faces-popover',
    as: 'pete',
    shows: 'New, Charlie bit my finger playing, Who saved it open (plus the why panel)',
    path: '/play?feed=new',
    seek: 41,
    setup: async (ctx) => {
      await attempt(ctx, 'theater ready', () => theaterReady(ctx.page))
      await playItem(ctx, 'Charlie bit my finger')
      await pausePlayback(ctx.page)
      // Wide screens show the reasons beside the stage (the board's right column).
      if (!ctx.mobile)
        await attempt(ctx, 'Why it’s on your feed open', async () => {
          await ctx.page
            .getByRole('button', { name: /^Why this one:/ })
            .locator('visible=true')
            .first()
            .click()
          await ctx.page
            .getByRole('complementary', { name: 'Why it’s on your feed' })
            .waitFor({ timeout: 5_000 })
        })
      await attempt(ctx, 'Who saved it open', async () => {
        await ctx.page
          .locator('button[aria-haspopup="dialog"]')
          .locator('visible=true')
          .first()
          .click()
        await ctx.page.getByRole('dialog', { name: 'Who saved it' }).waitFor({ timeout: 5_000 })
      })
    },
  },
  {
    name: 'j3-2-web-friend-channel',
    as: 'pete',
    shows: 'Ana’s saves (friend channel)',
    path: '/channels/friend/ana',
    phone: 'j3-3-phone-friend-channel',
    setup: async (ctx) => {
      await attempt(ctx, 'Ana’s note card', () =>
        ctx.page
          .getByRole('link', { name: /^Ana’s note:/ })
          .locator('visible=true')
          .first()
          .waitFor(),
      )
      await attempt(ctx, 'New marks', () =>
        ctx.page.getByText('New', { exact: true }).locator('visible=true').nth(1).waitFor(),
      )
      await attempt(ctx, 'Play the new ones', () =>
        ctx.page
          .getByRole('link', { name: /^Play the (\d+ new ones|new one)$/ })
          .locator('visible=true')
          .first()
          .waitFor(),
      )
    },
  },
  {
    name: 'j4-1-web-search-said',
    as: 'pete',
    shows: 'Search everyone: “the baby that bites his brother’s finger”, said in the video',
    path: `/search?q=${encodeURIComponent('the baby that bites his brother’s finger')}`,
    phone: 'j4-3-phone-search',
    known: [
      'Semantic search is off on the parity server: matches are keywords + seeded speech words.',
    ],
  },
  {
    name: 'j4-2-web-search-on-screen',
    as: 'pete',
    shows: 'Search everyone: “dark chocolate first time”, read on screen',
    path: `/search?q=${encodeURIComponent('dark chocolate first time')}`,
    known: [
      'Semantic search is off on the parity server: matches are keywords + seeded on-screen words.',
    ],
  },
  {
    name: 'j5-1-web-settings-invite',
    as: 'ana',
    shows: 'Ana’s Settings, Invite someone with a new link made and copied',
    path: '/settings',
    setup: async (ctx) => {
      const { page } = ctx
      await page.route('**/api/invites', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'inv_7KQ4parityMock',
            url: `${PARITY_ORIGIN}/invite/7KQ4parity-preview-only`,
            expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          }),
        })
      })
      await attempt(ctx, 'new link made (mocked)', () =>
        clickText(page, /Make an invite link|Make a link/),
      )
      await attempt(ctx, 'link copied', () => clickText(page, /^Copy$/))
    },
  },
  {
    name: 'j5-5-web-youre-in-qr',
    as: 'ben',
    shows: 'You’re in, Ben: the phone pairing code and QR',
    path: '/invite/done',
    phone: 'j5-4-phone-youre-in',
  },
  {
    name: 'j6-1-web-channels',
    as: 'pete',
    shows: 'Channels: From everyone, Your people, Made for you',
    path: '/channels',
    phone: 'j6-3-phone-channels',
  },
  {
    name: 'j6-2-web-group-channel',
    as: 'pete',
    shows: 'Food you’ll cook one day, playing It’s all about the sauce',
    path: '/play?group=food-youll-cook-one-day',
    seek: 3,
    setup: async (ctx) => {
      await attempt(ctx, 'theater ready', () => theaterReady(ctx.page))
      await playItem(ctx, 'It’s all about the sauce')
      await pausePlayback(ctx.page)
    },
  },
  {
    name: 'j7-1-web-right-now',
    as: 'pete',
    shows: 'Right now, with the shared-saves notice and a live moment',
    path: '/now',
    phone: 'j7-3-phone-live',
    known: [
      'Moment names come from the shared word without the model (“Baby”, not “Babies vs objects”): the board’s names aren’t in MOMENT_TOPICS and the no-model fallback is one shared word.',
      '“N saves in M min” counts from the seed’s save times, so the span grows the longer the server has run (10 min right after seeding).',
    ],
    setup: async (ctx) => {
      await attempt(ctx, 'LIVE · N saves in M min', () =>
        ctx.page
          // Phones run the names on after it ("… · Ana, Ben and 3 others").
          .getByText(/^\d+ saves? in \d+ min\b/)
          .locator('visible=true')
          .first()
          .waitFor({ timeout: 15_000 }),
      )
      const moment = await babiesMoment(ctx)
      if (moment) {
        watchMoment(ctx, 'ana', moment.slug)
        watchMoment(ctx, 'ben', moment.slug)
        await ctx.page.waitForTimeout(1_000)
        ctx.hit(`Ana and Ben watching ${moment.slug}`)
      } else ctx.miss('no live moment to watch')
    },
  },
  {
    name: 'j7-2-web-tuned-in',
    as: 'pete',
    shows: 'Tuned in to the babies moment, Ana and Ben watching, reactions rising',
    path: async (ctx) => {
      const moment = await babiesMoment(ctx)
      if (!moment) {
        ctx.miss('no live moment')
        return '/now'
      }
      watchMoment(ctx, 'ana', moment.slug)
      watchMoment(ctx, 'ben', moment.slug)
      ctx.hit(`moment ${moment.slug}`)
      return `/play?moment=${encodeURIComponent(moment.slug)}`
    },
    init: (ctx) => recordStreams(ctx.page),
    setup: async (ctx) => {
      const { page } = ctx
      await attempt(ctx, 'theater ready', () => theaterReady(page))
      await pausePlayback(page)
      // "Jo just saved one · playing next": Jo's save of Charlie lands in the
      // moment, played into this page's stream (the server's stream is untouched).
      const slug = new URL(page.url()).searchParams.get('moment')
      if (!slug) return
      await attempt(ctx, 'Jo just saved one (stream event in the browser)', async () => {
        const detail = await ctx.request.get(`/api/moments/${encodeURIComponent(slug)}`, {
          headers: { Cookie: ctx.creds.members.pete.cookie },
        })
        const body = (await detail.json()) as {
          moment: { slug: string; title: string; hue: string }
          items: Array<{
            post: { platform?: string; id: string; text?: string }
            savers?: Array<{ username: string }>
          }>
        }
        const jo = body.items.flatMap((i) => i.savers ?? []).find((s) => s.username === 'jo')
        const charlie = POSTS.find((p) => p.key === 'charlie')
        const post =
          body.items.find((i) => i.post.platform === charlie?.platform && i.post.id === charlie?.id)
            ?.post ?? body.items[body.items.length - 1]?.post
        if (!jo || !post) throw new Error('no Jo or post in the moment')
        const at = new Date().toISOString()
        const sent = await streamEvent(page, 'watch=', 'save', {
          type: 'save',
          item: {
            id: `parity-${Date.now()}`,
            key: `${post.platform ?? 'twitter'}:${post.id}`,
            at,
            post,
            to: {
              kind: 'moment',
              slug: body.moment.slug,
              title: body.moment.title,
              hue: body.moment.hue,
            },
          },
          saver: { ...jo, savedAt: at, isYou: false },
        })
        if (!sent) throw new Error('no open moment stream')
        await page
          .getByText(/just saved one/)
          .locator('visible=true')
          .first()
          .waitFor({ timeout: 5_000 })
      })
    },
    beforeShot: async (ctx) => {
      const { page } = ctx
      const slug = new URL(page.url()).searchParams.get('moment')
      if (!slug) return
      await attempt(ctx, 'reactions sent', async () => {
        const detail = await ctx.request.get(`/api/moments/${encodeURIComponent(slug)}`, {
          headers: { Cookie: ctx.creds.members.pete.cookie },
        })
        const body = (await detail.json()) as {
          items?: Array<{
            post?: { platform?: string; id?: string }
            platform?: string
            id?: string
          }>
        }
        const first = body.items?.[0]
        const platform = first?.post?.platform ?? first?.platform
        const id = first?.post?.id ?? first?.id
        if (!platform || !id) throw new Error('moment has no items')
        const send = async (who: PersonKey, text: string) => {
          const res = await ctx.request.post(`/api/moments/${encodeURIComponent(slug)}/react`, {
            headers: await asMember(ctx, who),
            data: { text, platform, id },
          })
          if (!res.ok()) throw new Error(`react ${who}: ${res.status()}`)
        }
        await send('pete', 'who sent this')
        await send('ben', 'again')
        await send('ana', 'ha')
        await page.waitForTimeout(1_200)
      })
    },
  },
  {
    name: 'j8-1-web-settings',
    as: 'pete',
    shows: 'Pete’s Settings (admin): You, Your people with Ben waiting',
    path: '/settings',
    phone: 'j8-4-phone-settings',
  },
  {
    name: 'j8-2-web-avatar',
    as: 'pete',
    shows: 'Settings, Change picture dialog',
    path: '/settings',
    known: [
      'Pete has no X connected here, so “Use your X picture” is left out (the board has it).',
    ],
    setup: async (ctx) => {
      const { page } = ctx
      await attempt(ctx, 'Change picture dialog', () => clickText(page, 'Change picture'))
      // The board crops pub-night.jpg: pick the seeded pub photo through the
      // file input, in the browser only (nothing is saved).
      await attempt(ctx, 'pub-night.jpg picked', async () => {
        const buffer = keptFile('pub', 'photo-1.jpg')
        await page
          .locator('input[type="file"][aria-label="Upload a photo"]')
          .setInputFiles({ name: 'pub-night.jpg', mimeType: 'image/jpeg', buffer })
        await page.getByText('Drag to move. Slide to zoom.').waitFor({ timeout: 10_000 })
      })
      // Zoomed in a little, like the board's slider.
      await attempt(ctx, 'zoomed', () =>
        page.getByRole('slider', { name: 'Zoom' }).evaluate((el) => {
          const input = el as HTMLInputElement
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
          set?.call(input, '1.25')
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }),
      )
    },
  },
  {
    name: 'j8-3-web-processing',
    as: 'pete',
    shows: 'What your ADHX is doing: keeping, converting, listening, needs you, waiting, ready',
    path: '/doing',
    phone: 'j8-5-phone-processing',
    known: ['“Mac helper connected” needs remote processing.'],
  },
]

// ——— the run ———

for (const board of BOARDS) {
  test(board.name, async ({ page, context, request }, testInfo) => {
    const project = testInfo.project.name
    const dir = path.join(PARITY_OUT, project)
    fs.mkdirSync(dir, { recursive: true })
    const reached: string[] = []
    const missed: string[] = []
    const cleanups: Array<() => void> = []
    const creds = credentials()
    const ctx: Ctx = {
      page,
      mobile: project.includes('mobile'),
      creds,
      request,
      miss: (w) => missed.push(w),
      hit: (w) => reached.push(w),
      cleanup: (fn) => cleanups.push(fn),
    }
    const member = creds.members[board.as]
    await context.addCookies([
      {
        name: 'adhx_session',
        value: member.session,
        url: PARITY_ORIGIN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
    // Captures never mark posts seen on the server.
    await page.route('**/api/views', (route) => route.fulfill({ status: 204, body: '' }))
    await page.route('**/api/app/seen', (route) => route.fulfill({ status: 204, body: '' }))
    // …nor queue understanding work (the theater asks for what's about to play).
    await page.route('**/api/understanding/prioritize', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"prioritized":0}' }),
    )

    let url = '/'
    try {
      url = typeof board.path === 'string' ? board.path : await board.path(ctx)
      if (board.init) await board.init(ctx)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
      await page.waitForLoadState('load', { timeout: 60_000 }).catch(() => {})
      await page.waitForTimeout(1_500)
      if (board.setup) await board.setup(ctx)
      await imagesLoaded(page)
      await stabilizeMedia(page, board.seek)
      await page.addStyleTag({
        content:
          (board.beforeShot
            ? ''
            : '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}') +
          '*{caret-color:transparent!important}' +
          // The `next dev` badge isn't part of the app.
          'nextjs-portal{display:none!important}',
      })
      await page.waitForTimeout(400)
      if (board.beforeShot) await board.beforeShot(ctx)
      await page.screenshot({
        path: path.join(dir, `${board.name}.png`),
        // Finishing animations would fade reactions out; boards with a beforeShot keep them live.
        animations: board.beforeShot ? 'allow' : 'disabled',
      })
    } finally {
      for (const fn of cleanups) fn()
      fs.writeFileSync(
        path.join(dir, `${board.name}.json`),
        JSON.stringify(
          {
            board: board.name,
            project,
            member: board.as,
            url,
            shows: board.shows,
            phone: board.phone ?? null,
            reached,
            missed,
            known: board.known ?? [],
            capturedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      )
    }
  })
}
