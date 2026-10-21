/**
 * The admin boards' world ("10 · Admin"), added on top of the friends-feed
 * seed: who brought whom in, when each member joined and was last seen,
 * their channels, reactions (counted per day and kind), the live-moment log,
 * opens/plays/searches/sends, hidden posts and the admin log.
 *
 * Kept away from everything the other boards show:
 * - Pete gets no channels (his Save sheet and Channels page stay the boards'),
 * - the only unseen sends go to Mum and Jo (no capture runs as them),
 * - Just for me saves are Pete's own general filler (his friends' channel
 *   counts stay the same),
 * - Ana's watched posts are filler, older than New's 14 days,
 * - the hidden posts aren't any board's posts.
 */
import crypto from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import { keptSrc } from '../../src/lib/keep/src'
import { phonePlatformOf } from '../../src/lib/people/last-seen'
import { ADMIN, person, post, type PersonKey } from './world'

const NOW = Date.now()
const MIN = 60_000
const DAY = 24 * 60 * MIN
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const sqliteTime = (msAgo: number) => iso(msAgo).replace('T', ' ').slice(0, 19)
const idOf = (key: PersonKey) => person(key).id

/** A small seeded random, so every run seeds the same world. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(1010)
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]

/** A time `daysAgo` days back, at an hour weighted to the evening (and Sundays a bit busier). */
function eveningTime(daysAgo: number): number {
  const day = new Date(NOW - daysAgo * DAY)
  const hours = [8, 12, 13, 18, 19, 20, 21, 21, 21, 22, 22, 22, 23]
  day.setHours(pick(hours), Math.floor(rand() * 60), Math.floor(rand() * 60), 0)
  const at = day.getTime()
  return Math.max(0, NOW - Math.min(at, NOW - MIN))
}

function joinedAndSeen() {
  for (const [key, a] of Object.entries(ADMIN.people) as [
    PersonKey,
    (typeof ADMIN.people)[PersonKey],
  ][]) {
    db.run(sql`
      UPDATE users SET created_at = ${sqliteTime(a.joinedDaysAgo * DAY)},
        last_seen_at = ${a.lastSeenMinutesAgo === null ? null : iso(a.lastSeenMinutesAgo * MIN)},
        role = ${a.admin ? 'admin' : 'user'}
      WHERE id = ${idOf(key)}`)
    if (a.invitedBy) {
      const id = `inv_${crypto.randomBytes(6).toString('base64url')}`
      db.run(sql`
        INSERT INTO invites (id, token_hash, created_by, created_at, expires_at, used_by, used_at)
        VALUES (${id}, ${crypto.randomBytes(32).toString('hex')}, ${idOf(a.invitedBy)},
          ${iso((a.joinedDaysAgo + 1) * DAY)}, ${NOW - a.joinedDaysAgo * DAY + 6 * DAY},
          ${idOf(key)}, ${iso(a.joinedDaysAgo * DAY)})`)
    }
  }
}

/** Pete's Just for me saves: some of his general filler (no shared channel holds it). */
function privateSaves(generalFiller: { platform: string; id: string }[]) {
  for (const f of generalFiller.slice(0, ADMIN.petePrivateFiller)) {
    db.run(sql`
      UPDATE bookmarks SET is_private = 1
      WHERE user_id = ${idOf('pete')} AND platform = ${f.platform} AND id = ${f.id}`)
  }
}

/** Where saves came from: the heroes stay pasted, the filler is spread like the board. */
function saveSources() {
  const rows = db.all<{ user_id: string; platform: string; id: string }>(sql`
    SELECT user_id, platform, id FROM bookmarks WHERE source = 'manual' AND processed_at < ${iso(15 * DAY)}`)
  const weights = ADMIN.sources
  const total = weights.reduce((s, w) => s + w.weight, 0)
  rows.forEach((r, i) => {
    let x = (((i * 7919) % 1000) / 1000) * total
    const w = weights.find((s) => (x -= s.weight) < 0) ?? weights[0]
    db.run(sql`
      UPDATE bookmarks SET source = ${w.source}
      WHERE user_id = ${r.user_id} AND platform = ${r.platform} AND id = ${r.id}`)
  })
}

/** Notes on older shared filler saves, to each member's board count. */
function notes() {
  for (const [key, a] of Object.entries(ADMIN.people) as [
    PersonKey,
    (typeof ADMIN.people)[PersonKey],
  ][]) {
    const have = Number(
      db.all<{ n: number }>(sql`
        SELECT COUNT(*) AS n FROM bookmarks WHERE user_id = ${idOf(key)} AND note IS NOT NULL`)[0]
        ?.n,
    )
    const rows = db.all<{ platform: string; id: string }>(sql`
      SELECT platform, id FROM bookmarks
      WHERE user_id = ${idOf(key)} AND note IS NULL AND is_private = 0 AND processed_at < ${iso(20 * DAY)}
      ORDER BY processed_at ASC LIMIT ${Math.max(0, a.notes - have)}`)
    rows.forEach((r, i) => {
      db.run(sql`
        UPDATE bookmarks SET note = ${ADMIN.noteWords[i % ADMIN.noteWords.length]}
        WHERE user_id = ${idOf(key)} AND platform = ${r.platform} AND id = ${r.id}`)
    })
  }
}

/** Members' channels (never Pete's): 23 in all, 6 public. */
function channels() {
  for (const ch of ADMIN.channels) {
    const rows = db.all<{ platform: string; id: string }>(sql`
      SELECT platform, id FROM bookmarks
      WHERE user_id = ${idOf(ch.who)} AND is_private = 0 AND COALESCE(source, '') != 'quoted'
      ORDER BY (text LIKE ${`%${ch.match}%`}) DESC, processed_at DESC LIMIT ${ch.posts}`)
    rows.forEach((r, i) => {
      db.run(sql`
        INSERT OR IGNORE INTO bookmark_tags (user_id, platform, bookmark_id, tag, created_at)
        VALUES (${idOf(ch.who)}, ${r.platform}, ${r.id}, ${ch.tag}, ${iso(ch.madeDaysAgo * DAY - i * MIN)})`)
    })
    if (ch.public) {
      db.run(sql`
        INSERT INTO tag_shares (user_id, tag, share_code, is_public, created_at, updated_at)
        VALUES (${idOf(ch.who)}, ${ch.tag}, ${crypto.randomBytes(6).toString('hex')}, 1,
          ${sqliteTime(ch.madeDaysAgo * DAY)}, ${iso(ch.madeDaysAgo * DAY)})`)
      db.run(sql`
        INSERT INTO collection_aggregates (owner_user_id, tag, view_count, clone_count, last_event_at, hidden)
        VALUES (${idOf(ch.who)}, ${ch.tag}, ${ch.views}, ${ch.keeps}, ${iso(DAY)}, 0)`)
    }
  }
}

/** Reactions, counted per member, day and kind (never the words or the post). */
function reactions() {
  for (const [key, a] of Object.entries(ADMIN.people) as [
    PersonKey,
    (typeof ADMIN.people)[PersonKey],
  ][]) {
    const counts = new Map<string, number>()
    for (let i = 0; i < a.reactions; i++) {
      // About a quarter this week; the rest over the month.
      const daysAgo = i % 4 === 0 ? Math.floor(rand() * 7) : 7 + Math.floor(rand() * 22)
      const kind = rand() < a.favouriteShare ? a.favourite : pick(ADMIN.reactionMix)
      const k = `${new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10)}|${kind}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    for (const [k, n] of counts) {
      const [day, kind] = k.split('|')
      db.run(sql`
        INSERT INTO reaction_counts (day, user_id, kind, count) VALUES (${day}, ${idOf(key)}, ${kind}, ${n})
        ON CONFLICT(day, user_id, kind) DO UPDATE SET count = count + ${n}`)
    }
  }
}

/** The live-moment log: this week's named moments, and older ones for the month. */
function momentLog() {
  for (const m of ADMIN.moments) {
    db.run(sql`
      INSERT INTO moment_log (slug, title, formed_at, tune_ins, peak_watching, reactions, alerts, alerts_opened)
      VALUES (${m.slug}, ${m.title}, ${iso(m.daysAgo * DAY + 5 * 60 * MIN)}, ${m.tuneIns}, ${m.peak},
        ${m.reactions}, ${m.alerts}, ${m.opened})`)
  }
  // Tune-ins by day for the last two weeks (board 10.4): small moments on each day.
  ADMIN.tuneInsByDay.forEach((n, i) => {
    const daysAgo = ADMIN.tuneInsByDay.length - 1 - i
    if (!n || ADMIN.moments.some((m) => m.daysAgo === daysAgo)) return
    db.run(sql`
      INSERT INTO moment_log (slug, title, formed_at, tune_ins, peak_watching, reactions)
      VALUES (${`earlier-${daysAgo}`}, ${'A quick one'}, ${iso(daysAgo * DAY + 3 * 60 * MIN)}, ${n}, ${Math.min(n, 3)}, ${n * 2})`)
  })
  for (let i = 0; i < ADMIN.olderMoments; i++) {
    db.run(sql`
      INSERT INTO moment_log (slug, title, formed_at, tune_ins, peak_watching, reactions)
      VALUES (${`older-${i}`}, ${'Earlier this month'}, ${iso((15 + (i % 14)) * DAY + i * MIN)}, ${1 + (i % 3)}, 2, ${i % 5})`)
  }
}

/** Opens, plays (and finishes), searches, file sends and shares, channel plays: 30 days of counts. */
function analytics(postKeys: { platform: string; id: string }[]) {
  const members = Object.keys(ADMIN.people) as PersonKey[]
  const insert = (
    name: string,
    msAgo: number,
    who: PersonKey,
    extra: {
      platform?: string
      bookmarkId?: string
      source?: string
      surface?: string
      contentType?: string
    } = {},
  ) => {
    db.run(sql`
      INSERT INTO analytics_events (name, platform, content_type, surface, source, bookmark_id, tag, user_id, created_at)
      VALUES (${name}, ${extra.platform ?? null}, ${extra.contentType ?? null}, ${extra.surface ?? null},
        ${extra.source ?? null}, ${extra.bookmarkId ?? null}, NULL, ${idOf(who)}, ${iso(msAgo)})`)
  }
  ADMIN.opensByDay.forEach((dayOpens, i) => {
    const daysAgo = ADMIN.opensByDay.length - 1 - i
    // Sundays are busiest (board 10.6: "Busiest 9 to 11pm, Sundays").
    const opens =
      new Date(NOW - daysAgo * DAY).getDay() === 0 ? Math.round(dayOpens * 1.6) : dayOpens
    for (let n = 0; n < opens; n++) {
      const r = rand()
      const source = r < 0.61 ? 'web' : r < 0.88 ? 'ios' : 'android'
      insert('app.open', eveningTime(daysAgo), pick(members), { source })
    }
    const plays = Math.round(opens * 2.8)
    for (let n = 0; n < plays; n++) {
      const p = pick(postKeys)
      const at = eveningTime(daysAgo)
      const who = pick(members)
      insert('post.play', at, who, { platform: p.platform, bookmarkId: p.id, contentType: 'video' })
      if (rand() < 0.72) {
        insert('post.finish', Math.max(0, at - 40_000), who, {
          platform: p.platform,
          bookmarkId: p.id,
        })
      }
    }
    const searches = Math.round(opens * 0.4)
    for (let n = 0; n < searches; n++) {
      insert(rand() < 0.81 ? 'search.found' : 'search.none', eveningTime(daysAgo), pick(members), {
        source: rand() < 0.68 ? 'meaning' : 'words',
      })
    }
  })
  for (let n = 0; n < ADMIN.filesSent; n++) {
    const p = pick(postKeys)
    insert('post.send', eveningTime(Math.floor(rand() * 29)), pick(members), {
      platform: p.platform,
      bookmarkId: p.id,
      source: n < ADMIN.filesShared ? 'share' : 'download',
    })
  }
  for (let n = 0; n < ADMIN.filesShared + ADMIN.linksShared; n++) {
    const p = pick(postKeys)
    insert('post.share', eveningTime(Math.floor(rand() * 29)), pick(members), {
      platform: p.platform,
      bookmarkId: p.id,
    })
  }
  for (const ch of ADMIN.channelPlays) {
    for (let n = 0; n < ch.plays; n++) {
      insert('channel.play', eveningTime(Math.floor(rand() * 7)), pick(members), {
        surface: ch.surface,
        bookmarkId: ch.ref,
      })
    }
    for (let n = 0; n < ch.keeps; n++) {
      insert('channel.keep', eveningTime(Math.floor(rand() * 7)), pick(members), {
        surface: ch.surface,
        bookmarkId: ch.ref,
      })
    }
  }
}

/** Sends to your people: watched ones between everyone, unseen ones only to Mum and Jo. */
function sends(filler: { platform: string; id: string; who: PersonKey }[]) {
  const members = Object.keys(ADMIN.people) as PersonKey[]
  let made = 0
  for (const [from, a] of Object.entries(ADMIN.people) as [
    PersonKey,
    (typeof ADMIN.people)[PersonKey],
  ][]) {
    const have = Number(
      db.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM post_sends WHERE from_user_id = ${idOf(from)}`,
      )[0]?.n,
    )
    const mine = filler.filter((f) => f.who === from)
    for (let i = 0; i < a.sends - have && i < mine.length; i++) {
      const f = mine[i]
      const to = members.filter((m) => m !== from)[i % (members.length - 1)]
      const unseen = (to === 'mum' || to === 'jo') && made % 3 === 0
      db.run(sql`
        INSERT OR IGNORE INTO post_sends (from_user_id, to_user_id, platform, post_id, note, created_at, seen_at)
        VALUES (${idOf(from)}, ${idOf(to)}, ${f.platform}, ${f.id}, NULL,
          ${iso((1 + (made % 28)) * DAY)}, ${unseen ? null : iso((made % 28) * DAY + MIN)})`)
      made++
    }
  }
}

/** What Ana watched this month: a count on her page (older filler, so New is untouched). */
function anaWatched(filler: { platform: string; id: string; who: PersonKey }[]) {
  const others = filler.filter((f) => f.who !== 'ana')
  const already = new Set(
    db
      .all<{ k: string }>(
        sql`SELECT platform || ':' || post_id AS k FROM post_views WHERE user_id = ${idOf('ana')} AND seen_at >= ${iso(30 * DAY)}`,
      )
      .map((r) => r.k),
  )
  let n = already.size
  for (const f of others) {
    if (n >= ADMIN.anaWatched) break
    if (already.has(`${f.platform}:${f.id}`)) continue
    db.run(sql`
      INSERT INTO post_views (user_id, platform, post_id, seen_at)
      VALUES (${idOf('ana')}, ${f.platform}, ${f.id}, ${iso((1 + (n % 28)) * DAY)})
      ON CONFLICT(user_id, platform, post_id) DO UPDATE SET seen_at = excluded.seen_at`)
    n++
  }
}

/** Two hidden posts (not any board's posts), and the admin log. */
function moderation() {
  for (const h of ADMIN.hidden) {
    const still = post(h.still)
    db.run(sql`
      INSERT INTO moderated_posts (platform, bookmark_id, hidden, reason, content_type, created_at, created_by)
      VALUES ('twitter', ${h.id}, 1, ${h.reason}, 'photo', ${iso(h.daysAgo * DAY)}, ${idOf(h.by)})`)
    db.run(sql`
      INSERT INTO activity (action, platform, bookmark_id, author, text, thumbnail_url, content_type, url, created_at, hidden)
      VALUES ('preview', 'twitter', ${h.id}, ${h.author}, ${h.title},
        ${keptSrc(still.platform, still.id, 'poster', still.author)}, 'photo',
        ${`/${h.author}/status/${h.id}`}, ${iso(h.daysAgo * DAY + 60 * MIN)}, 1)`)
  }
  for (const a of ADMIN.audit) {
    db.run(sql`
      INSERT INTO admin_audit (actor_user_id, action, target, created_at)
      VALUES (${idOf(a.by)}, ${a.action}, ${JSON.stringify(a.target)}, ${iso(a.daysAgo * DAY)})`)
  }
}

/** The Mac helper's name, from the last conversion it finished. */
function helper() {
  const w = post(ADMIN.convertedBy.post)
  db.run(sql`
    INSERT OR IGNORE INTO media_conversions (platform, post_id, slot, source_path, source_bytes,
      source_created_at, source_hash, has_audio, status, attempts, next_attempt_at, worker_id, updated_at)
    VALUES (${w.platform}, ${w.id}, 'video-1', 'parity/none', 0, ${iso(2 * DAY)}, 'parity', 1, 'done', 1, 0,
      ${ADMIN.convertedBy.worker}, ${iso(2 * DAY)})`)
}

/** Each phone's kind, as its first request would say (board 10.2: 4 iPhone, 2 Android). */
function phonePlatforms() {
  for (const k of db.all<{ id: string; name: string }>(
    sql`SELECT id, name FROM access_keys WHERE scope = 'phone'`,
  )) {
    const platform = phonePlatformOf(null, k.name)
    if (platform) db.run(sql`UPDATE access_keys SET platform = ${platform} WHERE id = ${k.id}`)
  }
}

export function seedAdminWorld(
  filler: { platform: string; id: string; who: PersonKey; general: boolean }[],
) {
  joinedAndSeen()
  privateSaves(filler.filter((f) => f.who === 'pete' && f.general))
  saveSources()
  notes()
  channels()
  reactions()
  momentLog()
  const heroKeys = ADMIN.playedPosts.map((k) => post(k))
  analytics(heroKeys)
  sends(filler)
  anaWatched(filler)
  moderation()
  helper()
}

/** After the phones are paired (writeCredentials pairs them). */
export function seedAdminPhones() {
  phonePlatforms()
}
