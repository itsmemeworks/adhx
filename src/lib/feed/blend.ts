/**
 * The blended feed (docs/specs/friends-feed.md → "The blend"): how the posts
 * your people saved are ordered for you, and the words for why each one is
 * there. Pure — no database, no clock of its own — so every rule is testable.
 * The database side (candidates, the seen list, vectors, the per-user
 * snapshot that keeps pages stable) is `blend-db.ts`.
 *
 * Signals, each 0–1, weighted by `BLEND_WEIGHTS` and summed:
 * - fresh: the newest save, decaying over about a day (`e^(-hours/24)`).
 * - saved together: two or more people saved it.
 * - close to you: how much of that friend's saves you've seen or saved too.
 * - like what you keep: closeness to the mean of your last saves, against
 *   the rest of the pool (the top tenth reads 1).
 * Then: posts you've seen drop out of `new`; your own saves play sparingly;
 * "Show more / less from Ana" scales her posts; a small seeded jitter breaks
 * ties per snapshot. Finally the variety pass keeps one friend (or one topic)
 * to at most 2 in a row.
 *
 * Everyone, Friends and Mine skip all that: they are the latest saves,
 * newest first, seen or not (`NEWEST_FIRST`). The scores still decide what
 * each post says about why it's there.
 *
 * No engagement signals: nothing here counts plays, likes or time watched
 * beyond "seen", and For you's rotation reads only when you last watched a
 * post — these are the only reasons.
 */

export type BlendMode = 'new' | 'everyone' | 'friends' | 'mine' | 'lineup'
export const BLEND_MODES: readonly BlendMode[] = ['new', 'everyone', 'friends', 'mine', 'lineup']

/**
 * The lineup (the phones' New): always the same order, so opening the app is
 * predictable. Just saved (since you last looked), then Not seen yet, both
 * newest first; then For you, closest to what you keep and react to.
 */
export type LineupSection = 'just' | 'unseen' | 'foryou'

/** The modes that are simply the latest saves, newest first, seen or not. */
export const NEWEST_FIRST: readonly BlendMode[] = ['everyone', 'friends', 'mine']

export function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && (BLEND_MODES as readonly string[]).includes(value)
}

/** Why a post is in the feed, as one reason. The first is the headline (`why`). */
export type WhyKind = 'sent' | 'together' | 'more' | 'like' | 'close' | 'fresh' | 'yours'
export interface WhyReason {
  kind: WhyKind
  text: string
  /** The friend the reason is about (for "Show more / less from …"; the sender of `sent`). */
  username?: string
  /**
   * `like` only: the viewer's own kept post it's most like, for the thumbnail
   * beside "Like … you kept" (`posterUrl` is added by `blend-db.ts`).
   */
  post?: { platform: string; id: string; posterUrl?: string | null }
  /** `sent` only: the sender's note, when they wrote one. */
  note?: string
}

/** Someone sent the viewer this post and they haven't seen it yet. */
export interface BlendSend {
  username: string
  name: string | null
  /** When they sent it (epoch ms). */
  at: number
  note: string | null
}

/** One save of a candidate post: a member's visible save, or the viewer's own. */
export interface BlendSave {
  userId: string
  username: string
  name: string | null
  /** When they saved it (epoch ms). */
  savedAt: number
}

export interface BlendCandidate {
  /** `platform:id`. */
  key: string
  saves: BlendSave[]
  /** Cosine to the mean of the viewer's recent saves; null when not understood. */
  similarity: number | null
  /** The kept post it's most like: "the frog videos", "@ana’s video", and which post. */
  like?: { label: string; topic: string | null; post?: { platform: string; id: string } } | null
  /** Unseen sends of it to the viewer, newest first ("Pete sent you this"). */
  sent?: BlendSend[]
  /** The viewer has a `post_views` row for it. */
  seen: boolean
  /**
   * When the viewer last watched it (epoch ms): their seen mark or their last
   * play, whichever is later. Lineup only; null or absent when never.
   */
  watchedAt?: number | null
}

export type FeedWeight = -1 | 0 | 1

export interface BlendContext {
  viewerId: string
  now: number
  /** Friend userId → share of their saves the viewer has seen or saved too (0–1). */
  closeness: Map<string, number>
  /** Friend username → show more (1) or less (-1). */
  weights: Record<string, FeedWeight>
  /** Snapshot seed: the same seed gives the same order. */
  seed?: string
  /** Lineup: when the viewer last looked (epoch ms; null when never or unknown). */
  lastLookedAt?: number | null
}

export interface BlendPick {
  key: string
  score: number
  why: string
  reasons: WhyReason[]
  /** Whose post it counts as for variety (newest other saver, else the viewer). */
  saver: string
  topic: string | null
  /** Only the viewer saved it. */
  ownOnly: boolean
  /** Newest unseen send to the viewer (epoch ms), when someone sent it. */
  sentAt?: number
  /** Lineup: which part of it the post is in. */
  section?: LineupSection
}

export const BLEND_WEIGHTS = {
  fresh: 1,
  together: 0.9,
  close: 0.6,
  like: 0.7,
  /** Multiplier for posts already seen (modes other than `new`). */
  seen: 0.35,
  /** Multiplier for posts only you saved, outside `mine`. */
  own: 0.3,
  /** "Show more from Ana" / "Show less from Ana". */
  more: 1.6,
  less: 0.4,
  /** Largest tie-break nudge from the seed. */
  jitter: 0.04,
} as const

export const LINEUP = {
  /** Just saved reaches back at most this far, however long you've been away. */
  justHours: 48,
  /** Never looked before: Just saved is the last day. */
  firstVisitHours: 24,
  /** Not seen yet goes back this far (New's window); older unseen posts can be For you. */
  unseenDays: 14,
  /** For you holds at most this many. */
  forYou: 60,
} as const

/** Fresh decays as e^(-hours / FRESH_HOURS). */
export const FRESH_HOURS = 24
/** Thresholds for a signal to be named in the why. */
export const LIKE_SHOWN = 0.5
export const CLOSE_SHOWN = 0.5
/** At most this many in a row from one friend (or one topic). */
export const MAX_RUN = 2
/** Outside `mine`, at most one post only you saved in every this many. */
export const OWN_EVERY = 4

const HOUR = 3_600_000

/** "just now", "5m", "3h", "2d", "3w". */
export function shortAgo(at: number, now: number): string {
  const s = Math.max(0, (now - at) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86_400) return `${Math.floor(s / 3600)}h`
  if (s < 14 * 86_400) return `${Math.floor(s / 86_400)}d`
  return `${Math.floor(s / (7 * 86_400))}w`
}

function nameOf(save: BlendSave): string {
  return save.name?.trim() || save.username
}

/** "Pete sent you this", "Pete and Ana sent you this", "Pete and 2 others sent you this". */
export function sentLine(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} sent you this`
  if (names.length === 2) return `${names[0]} and ${names[1]} sent you this`
  return `${names[0]} and ${names.length - 1} others sent you this`
}

/** "Ana and Ben saved this", "You and Ana saved this", "Ana and 2 others saved this". */
export function togetherLine(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} saved this`
  if (names.length === 2) return `${names[0]} and ${names[1]} saved this`
  return `${names[0]} and ${names.length - 1} others saved this`
}

/** A stable number in [0, 1) from text (FNV-1a). */
export function hashUnit(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0x1_0000_0000
}

/**
 * "Like what you keep", 0–1, relative to this pool: at or below the median
 * similarity reads 0, the top tenth reads 1. Absolute cosines depend on the
 * model, so only the order within the pool is trusted.
 */
export function likeScores(candidates: BlendCandidate[]): Map<string, number> {
  const sims = candidates
    .map((c) => c.similarity)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s))
    .sort((a, b) => a - b)
  const out = new Map<string, number>()
  if (sims.length < 2) {
    // Nothing to compare with: a lone understood post is only as like as its cosine says.
    for (const c of candidates) {
      if (c.similarity !== null) out.set(c.key, Math.max(0, Math.min(1, c.similarity)))
    }
    return out
  }
  const at = (q: number) => sims[Math.min(sims.length - 1, Math.floor(q * (sims.length - 1)))]
  const mid = at(0.5)
  const top = at(0.9)
  const span = top - mid
  for (const c of candidates) {
    if (c.similarity === null || !Number.isFinite(c.similarity)) continue
    out.set(c.key, span > 1e-6 ? Math.max(0, Math.min(1, (c.similarity - mid) / span)) : 0)
  }
  return out
}

export interface Scored {
  score: number
  signals: { fresh: number; together: number; close: number; like: number }
  reasons: WhyReason[]
  saver: string
  ownOnly: boolean
}

/**
 * One post's score and reasons in a mode, or null when the mode leaves it out:
 * - `new`: someone else saved it and you haven't seen it.
 * - `everyone`: any of it; your own sparingly.
 * - `friends`: posts friends saved that you haven't saved yourself.
 * - `mine`: your saves.
 */
export function scoreCandidate(
  c: BlendCandidate,
  ctx: BlendContext,
  mode: BlendMode,
  like = 0,
): Scored | null {
  const others = c.saves
    .filter((s) => s.userId !== ctx.viewerId)
    .sort((a, b) => b.savedAt - a.savedAt)
  // One save per person (a re-save isn't a second voice).
  const people: BlendSave[] = []
  for (const s of others) if (!people.some((p) => p.userId === s.userId)) people.push(s)
  const mine = c.saves.find((s) => s.userId === ctx.viewerId) ?? null

  if (mode === 'new' && (people.length === 0 || c.seen)) return null
  if (mode === 'friends' && (people.length === 0 || mine)) return null
  if (mode === 'mine' && !mine) return null
  if (!mine && people.length === 0) return null

  const ownOnly = people.length === 0
  const newest = mode === 'mine' || ownOnly ? mine!.savedAt : people[0].savedAt
  const fresh = Math.exp(-Math.max(0, ctx.now - newest) / HOUR / FRESH_HOURS)
  const voices = people.length + (mine ? 1 : 0)
  const together = voices >= 2 ? Math.min(1, 0.5 + 0.25 * (voices - 2)) : 0
  let close = 0
  let closest: BlendSave | null = null
  for (const p of people) {
    const v = ctx.closeness.get(p.userId) ?? 0
    if (v > close) {
      close = v
      closest = p
    }
  }

  let score =
    BLEND_WEIGHTS.fresh * fresh +
    BLEND_WEIGHTS.together * together +
    BLEND_WEIGHTS.close * close +
    BLEND_WEIGHTS.like * like +
    BLEND_WEIGHTS.jitter * hashUnit(`${ctx.seed ?? ''}|${c.key}`)

  if (c.seen && mode !== 'new') score *= BLEND_WEIGHTS.seen
  if (ownOnly && mode !== 'mine') score *= BLEND_WEIGHTS.own

  const boosted = people.find((p) => ctx.weights[p.username] === 1) ?? null
  if (boosted) score *= BLEND_WEIGHTS.more
  else if (people.length > 0 && people.every((p) => ctx.weights[p.username] === -1)) {
    score *= BLEND_WEIGHTS.less
  }

  // Reasons, strongest kind first; the first one is the headline. A post
  // someone sent you leads with who sent it until you've seen it.
  const reasons: WhyReason[] = []
  const senders = mode === 'mine' ? [] : (c.sent ?? [])
  if (senders.length > 0) {
    const names: string[] = []
    for (const s of senders) {
      const n = s.name?.trim() || s.username
      if (!names.includes(n)) names.push(n)
    }
    const note = senders.find((s) => s.note)?.note
    reasons.push({
      kind: 'sent',
      text: sentLine(names),
      username: senders[0].username,
      ...(note ? { note } : {}),
    })
  }
  if (voices >= 2) {
    const names = [...(mine ? ['You'] : []), ...people.map(nameOf)]
    reasons.push({
      kind: 'together',
      text: togetherLine(names),
      ...(people[0] ? { username: people[0].username } : {}),
    })
  }
  if (boosted) {
    reasons.push({
      kind: 'more',
      text: `You asked for more from ${nameOf(boosted)}`,
      username: boosted.username,
    })
  }
  if (like >= LIKE_SHOWN && c.like?.label) {
    reasons.push({
      kind: 'like',
      text: `Like ${c.like.label} you kept`,
      ...(c.like.post ? { post: { ...c.like.post } } : {}),
    })
  }
  if (closest && close >= CLOSE_SHOWN) {
    reasons.push({
      kind: 'close',
      text: `You watch most of ${nameOf(closest)}’s saves`,
      username: closest.username,
    })
  }
  if (voices < 2) {
    reasons.push(
      ownOnly
        ? { kind: 'yours', text: `You saved this · ${shortAgo(mine!.savedAt, ctx.now)}` }
        : {
            kind: 'fresh',
            text: `${nameOf(people[0])} saved this · ${shortAgo(people[0].savedAt, ctx.now)}`,
            username: people[0].username,
          },
    )
  }

  return {
    score,
    signals: { fresh, together, close, like },
    reasons,
    saver: people[0]?.userId ?? ctx.viewerId,
    ownOnly,
  }
}

/** How far ahead the variety pass looks for a post that keeps the rules. */
const LOOKAHEAD = 60

/**
 * Re-order best-first picks so no friend (and no known topic) plays more than
 * `MAX_RUN` in a row, and — outside `mine` — your own saves stay at one in
 * every `OWN_EVERY`. When nothing nearby keeps a rule, the best post plays anyway.
 */
export function applyVariety(sorted: BlendPick[], mode: BlendMode): BlendPick[] {
  const rest = [...sorted]
  const out: BlendPick[] = []
  const runOf = (pick: BlendPick, field: 'saver' | 'topic') => {
    const value = pick[field]
    if (value === null) return 0
    let n = 0
    for (let i = out.length - 1; i >= 0 && out[i][field] === value; i--) n++
    return n
  }
  const ownRecently = () => out.slice(-(OWN_EVERY - 1)).some((p) => p.ownOnly)
  while (rest.length > 0) {
    const window = Math.min(rest.length, LOOKAHEAD)
    const fits = (p: BlendPick, strict: boolean) =>
      (mode === 'mine' || runOf(p, 'saver') < MAX_RUN) &&
      runOf(p, 'topic') < MAX_RUN &&
      (!strict || mode === 'mine' || !p.ownOnly || !ownRecently())
    let at = -1
    for (let i = 0; i < window && at === -1; i++) if (fits(rest[i], true)) at = i
    for (let i = 0; i < window && at === -1; i++) if (fits(rest[i], false)) at = i
    if (at === -1) at = 0
    out.push(rest.splice(at, 1)[0])
  }
  return out
}

/**
 * The lineup, in its three parts. Just saved and Not seen yet are your
 * people's posts you haven't seen from the last `unseenDays`, newest save (or
 * send) first, split at when you last looked. For you is the rest of the pool
 * that others saved and you didn't (older unseen posts before watched ones),
 * closest to your taste first (the blend's order where nothing is understood),
 * with variety applied and its "Like …" reason leading.
 */
export function lineup(candidates: BlendCandidate[], ctx: BlendContext): BlendPick[] {
  const likes = likeScores(candidates)
  type Entry = { c: BlendCandidate; scored: Scored; like: number; at: number }
  const unseen: Entry[] = []
  const rest: Entry[] = []
  for (const c of candidates) {
    const like = likes.get(c.key) ?? 0
    const others = c.saves.filter((s) => s.userId !== ctx.viewerId)
    const at = Math.max(0, c.sent?.[0]?.at ?? 0, ...others.map((s) => s.savedAt))
    const asNew = scoreCandidate(c, ctx, 'new', like)
    if (asNew && at >= ctx.now - LINEUP.unseenDays * 24 * HOUR) {
      unseen.push({ c, scored: asNew, like, at })
      continue
    }
    // For you is what you haven't saved yourself.
    if (c.saves.some((s) => s.userId === ctx.viewerId)) continue
    const asAll = scoreCandidate(c, ctx, 'everyone', like)
    if (asAll) rest.push({ c, scored: asAll, like, at })
  }
  const byNewest = (a: Entry, b: Entry) =>
    b.at - a.at || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : 0)
  unseen.sort(byNewest)
  const floor = ctx.now - LINEUP.justHours * HOUR
  const cutoff = Math.max(floor, ctx.lastLookedAt ?? ctx.now - LINEUP.firstVisitHours * HOUR)
  const pick = (e: Entry, section: LineupSection, reasons = e.scored.reasons): BlendPick => ({
    key: e.c.key,
    score: e.scored.score,
    why: reasons[0]?.text ?? '',
    reasons,
    saver: e.scored.saver,
    topic: e.like >= LIKE_SHOWN ? (e.c.like?.topic ?? null) : null,
    ownOnly: e.scored.ownOnly,
    ...(e.c.sent?.length ? { sentAt: e.c.sent[0].at } : {}),
    section,
  })
  const just = unseen.filter((e) => e.at > cutoff).map((e) => pick(e, 'just'))
  const notSeen = unseen.filter((e) => e.at <= cutoff).map((e) => pick(e, 'unseen'))
  const understood = rest.some((e) => e.c.similarity !== null)
  // Unwatched first, closest to your taste first. Then what you've watched,
  // the one you watched longest ago first, so Home never opens on the post
  // you just saw.
  const watched = (e: Entry) => (e.c.seen ? (e.c.watchedAt ?? 0) : null)
  rest.sort((a, b) => {
    const wa = watched(a)
    const wb = watched(b)
    if ((wa === null) !== (wb === null)) return wa === null ? -1 : 1
    if (wa !== null && wb !== null && wa !== wb) return wa - wb
    return (
      (understood
        ? (b.c.similarity ?? -2) - (a.c.similarity ?? -2)
        : b.scored.score - a.scored.score) || byNewest(a, b)
    )
  })
  const forYou = applyVariety(
    rest.slice(0, LINEUP.forYou).map((e) => {
      // For you always says what it's like when it knows, however close.
      const like: WhyReason[] = e.scored.reasons.filter((r) => r.kind === 'like')
      if (like.length === 0 && e.c.like?.label && e.c.similarity !== null) {
        like.push({
          kind: 'like',
          text: `Like ${e.c.like.label} you kept`,
          ...(e.c.like.post ? { post: { ...e.c.like.post } } : {}),
        })
      }
      const likeFirst = [...like, ...e.scored.reasons.filter((r) => r.kind !== 'like')]
      return pick(e, 'foryou', likeFirst)
    }),
    'everyone',
  )
  return [...just, ...notSeen, ...forYou]
}

/** The whole feed for one mode, best first, with variety applied. */
export function blend(
  candidates: BlendCandidate[],
  ctx: BlendContext,
  mode: BlendMode,
): BlendPick[] {
  if (mode === 'lineup') return lineup(candidates, ctx)
  const likes = likeScores(candidates)
  const newest = new Map<string, number>()
  const picks: BlendPick[] = []
  for (const c of candidates) {
    const scored = scoreCandidate(c, ctx, mode, likes.get(c.key) ?? 0)
    if (!scored) continue
    // Mine is when you saved it; elsewhere, the newest save anyone made.
    const own = mode === 'mine' ? c.saves.filter((s) => s.userId === ctx.viewerId) : c.saves
    newest.set(c.key, Math.max(...own.map((s) => s.savedAt)))
    picks.push({
      key: c.key,
      score: scored.score,
      why: scored.reasons[0]?.text ?? '',
      reasons: scored.reasons,
      saver: scored.saver,
      // Only a post that's clearly like a topic you keep counts as that topic.
      topic: (likes.get(c.key) ?? 0) >= LIKE_SHOWN ? (c.like?.topic ?? null) : null,
      ownOnly: scored.ownOnly,
      ...(mode !== 'mine' && c.sent?.length ? { sentAt: c.sent[0].at } : {}),
    })
  }
  const byKey = (a: BlendPick, b: BlendPick) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  if (NEWEST_FIRST.includes(mode)) {
    // The latest saves, newest first, seen or not: no scores, no variety.
    return picks.sort((a, b) => (newest.get(b.key) ?? 0) - (newest.get(a.key) ?? 0) || byKey(a, b))
  }
  picks.sort(
    (a, b) =>
      b.score - a.score || (newest.get(b.key) ?? 0) - (newest.get(a.key) ?? 0) || byKey(a, b),
  )
  const varied = applyVariety(picks, mode)
  if (mode !== 'new') return varied
  // New plays what your people sent you first, newest send first.
  const sent = varied
    .filter((p) => p.sentAt !== undefined)
    .sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))
  return sent.length ? [...sent, ...varied.filter((p) => p.sentAt === undefined)] : varied
}

// ——— Cursors: an opaque handle on one snapshot ———

export interface BlendCursor {
  /** The snapshot's seed. */
  s: string
  /** Where the next page starts. */
  o: number
}

const SEED = /^[a-z0-9]{4,32}$/

// The JSON is plain ASCII (seed [a-z0-9], a number), so btoa/atob are safe
// on the server and in browsers alike.
export function encodeCursor(cursor: BlendCursor): string {
  return btoa(JSON.stringify({ s: cursor.s, o: cursor.o }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function decodeCursor(text: string | null | undefined): BlendCursor | null {
  if (!text || text.length > 200) return null
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
    const raw = JSON.parse(atob(text.replace(/-/g, '+').replace(/_/g, '/'))) as Partial<BlendCursor>
    if (typeof raw?.s !== 'string' || !SEED.test(raw.s)) return null
    if (typeof raw.o !== 'number' || !Number.isInteger(raw.o) || raw.o < 0 || raw.o > 100_000) {
      return null
    }
    return { s: raw.s, o: raw.o }
  } catch {
    return null
  }
}

// ——— "Show more / less from …" (user_preferences `feed.weights`) ———

export const FEED_WEIGHTS_KEY = 'feed.weights'
const MAX_WEIGHTS = 500
const USERNAME = /^[A-Za-z0-9_]{1,40}$/

/** The stored JSON `{ username: -1 | 1 }`; anything else is dropped. */
export function parseWeights(value: string | null | undefined): Record<string, FeedWeight> {
  const out: Record<string, FeedWeight> = {}
  if (!value) return out
  try {
    const raw = JSON.parse(value) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
    for (const [name, w] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_WEIGHTS)) {
      if (USERNAME.test(name) && (w === 1 || w === -1)) out[name] = w
    }
  } catch {
    // A hand-edited or old value: start over.
  }
  return out
}

export function isFeedWeight(value: unknown): value is FeedWeight {
  return value === -1 || value === 0 || value === 1
}

// ——— Query (`?mode=&limit=&cursor=`) ———

export const BLEND_PAGE = { default: 20, max: 50 } as const

/** `mode` (default `new`), `limit` (1–50, default 20) and `cursor`, or what's wrong. */
export function parseBlendQuery(
  params: URLSearchParams,
):
  | { mode: BlendMode; limit: number; cursor: string | null; types: FeedKind[] | null }
  | { error: string } {
  const mode = params.get('mode') ?? 'new'
  if (!isBlendMode(mode)) return { error: `mode must be one of ${BLEND_MODES.join(', ')}.` }
  const raw = Number.parseInt(params.get('limit') ?? '', 10)
  const limit = Number.isFinite(raw)
    ? Math.min(BLEND_PAGE.max, Math.max(1, raw))
    : BLEND_PAGE.default
  const cursor = params.get('cursor')
  if (cursor && !decodeCursor(cursor)) return { error: 'That page link has expired. Start again.' }
  // Omitted: the person's stored choice (`feed.types`).
  const typesParam = params.get('types')
  const types = typesParam === null ? null : parseFeedTypes(typesParam)
  if (typesParam !== null && !types) {
    return { error: `types is a comma list of ${FEED_KINDS.join(', ')}, at least one.` }
  }
  return { mode, limit, cursor: cursor || null, types }
}

// ——— "What's in your feed" (user_preferences `feed.types`) ———

/** What a post is, for the feed's filter. Sound (SoundCloud) counts as video. */
export type FeedKind = 'video' | 'photo' | 'text' | 'article'
export const FEED_KINDS: readonly FeedKind[] = ['video', 'photo', 'text', 'article']
/** Most people want video and pictures; text posts and articles are opt-in. */
export const DEFAULT_FEED_KINDS: readonly FeedKind[] = ['video', 'photo']
export const FEED_TYPES_KEY = 'feed.types'

/** `video,photo` → the kinds in a fixed order; null when empty or anything is unknown. */
export function parseFeedTypes(text: string | null | undefined): FeedKind[] | null {
  if (!text) return null
  const parts = text
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) return null
  // `audio` is what the phone calls a sound post; it plays with videos.
  const kinds = parts.map((p) => (p === 'audio' ? 'video' : p))
  if (!kinds.every((k) => (FEED_KINDS as readonly string[]).includes(k))) return null
  return FEED_KINDS.filter((k) => kinds.includes(k))
}

export const FEED_KIND_LABELS: Record<FeedKind, string> = {
  video: 'Videos',
  photo: 'Photos',
  text: 'Text posts',
  article: 'Articles',
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** "Videos and photos", "Videos only", "Everything". */
export function feedTypesSummary(types: readonly FeedKind[]): string {
  const kinds = FEED_KINDS.filter((k) => types.includes(k))
  if (kinds.length === FEED_KINDS.length) return 'Everything'
  if (kinds.length === 1) return `${FEED_KIND_LABELS[kinds[0]]} only`
  const words = kinds.map((k, i) =>
    i === 0 ? FEED_KIND_LABELS[k] : FEED_KIND_LABELS[k].toLowerCase(),
  )
  return listWords(words)
}

const KIND_NOUNS: Record<FeedKind, [string, string]> = {
  video: ['video', 'videos'],
  photo: ['photo', 'photos'],
  text: ['text post', 'text posts'],
  article: ['article', 'articles'],
}

/** "4 text posts waiting", "4 text posts and 1 article waiting"; '' when none. */
export function waitingLine(waiting: Partial<Record<FeedKind, number>>): string {
  const parts = FEED_KINDS.flatMap((k) => {
    const n = waiting[k] ?? 0
    return n > 0 ? [`${n} ${KIND_NOUNS[k][n === 1 ? 0 : 1]}`] : []
  })
  return parts.length ? `${listWords(parts)} waiting` : ''
}

/** Unseen New posts the filter leaves out, by kind (for "4 text posts waiting · Show them"). */
export function waitingKinds(
  hidden: (BlendCandidate & { kind: FeedKind })[],
  ctx: BlendContext,
): Partial<Record<FeedKind, number>> {
  const out: Partial<Record<FeedKind, number>> = {}
  for (const c of hidden) {
    if (scoreCandidate(c, ctx, 'new')) out[c.kind] = (out[c.kind] ?? 0) + 1
  }
  return out
}
