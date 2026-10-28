/**
 * Build the parity database: the world the friends-feed design boards show
 * (e2e/parity/world.ts), on a freshly migrated sqlite file. Run by
 * `e2e/parity/serve.ts` with the parity env (DATABASE_PATH, MEDIA_DIR,
 * SESSION_SECRET) already set, because `@/lib/db` reads it at import.
 *
 * Writes `e2e/parity/.out/credentials.json`: a session cookie and a paired
 * phone key per member.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { SignJWT } from 'jose'
import { sql } from 'drizzle-orm'
import { db } from '../../src/lib/db'
import {
  autoChannels,
  bookmarks,
  groupChannels,
  invites,
  keepJobs,
  keepSettings,
  postEmbeddings,
  postExtractedText,
  postSends,
  postViews,
  serverSettings,
  understandingQueue,
  userIdentities,
  users,
} from '../../src/lib/db/schema'
import { absolutePath, postDir, recordKept, type Slot } from '../../src/lib/keep/store'
import { createPairCode, redeemPairCode } from '../../src/lib/auth/phone-pairing'
import {
  SCREEN_VERSION,
  SEMANTIC_DIMS,
  SEMANTIC_MODEL_VERSION,
  SPEECH_VERSION,
} from '../../src/lib/semantic/config'
import { normalize, toBlob } from '../../src/lib/semantic/vectors'
import { networkSourceUrl } from '../../src/lib/platform/networks'
import {
  PARITY_CREDENTIALS,
  PARITY_MEDIA_DIR,
  PARITY_PUBLIC_ORIGIN,
  PARITY_OUT,
  PARITY_SESSION_SECRET,
  parityMediaSource,
} from './env'
import { prepareMedia, usingMediaSource } from './media'
import { seedAdminPhones, seedAdminWorld } from './seed-admin'
import { buildShowcaseMedia, showcaseEnabled } from './showcase'
import {
  DOING,
  FILLER_STILLS,
  FILLER_WORDS,
  GROUP_CHANNELS,
  INVITES,
  MADE_FOR_PETE,
  PENDING,
  PEOPLE,
  PETE_SEEN,
  POSTS,
  SENT_TO_PETE,
  TOPIC_AXIS,
  d,
  person,
  post,
  type PersonKey,
  type Topic,
  type WorldPost,
} from './world'

const NOW = Date.now()
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()
/** `users.created_at` uses SQLite's CURRENT_TIMESTAMP shape. */
const sqliteTime = (minutesAgo: number) => iso(minutesAgo).replace('T', ' ').slice(0, 19)
/** Derived rows (channels) are stamped ahead so they never go stale while the server runs. */
const PINNED_COMPUTE_AT = new Date(NOW + 30 * 24 * 60 * 60_000).toISOString()

const idOf = (key: PersonKey) => person(key).id

// ——— Vectors (no model runs here; same shape as e2e/seed.ts) ———

function noise(seed: number): Float32Array {
  const v = new Float32Array(SEMANTIC_DIMS)
  let t = seed * 9973 + 1
  for (let i = 0; i < SEMANTIC_DIMS; i++) {
    t = (t * 16807) % 2147483647
    v[i] = (t / 2147483647 - 0.5) * 0.12
  }
  return v
}

function topicVector(topic: Topic, seed: number): Float32Array {
  const v = noise(seed)
  v[TOPIC_AXIS[topic]] += 1
  return normalize(v)
}

function understand(platform: string, id: string, topic: Topic, seed: number, kinds = ['text']) {
  for (const kind of kinds) {
    db.insert(postEmbeddings)
      .values({
        platform,
        postId: id,
        kind,
        model: SEMANTIC_MODEL_VERSION,
        contentHash: `parity-${kind}-${id}`,
        dims: SEMANTIC_DIMS,
        vector: toBlob(topicVector(topic, seed)),
        status: 'ok',
        createdAt: iso(1),
      })
      .run()
  }
}

function extracted(platform: string, id: string, kind: 'speech' | 'screen', text: string) {
  db.insert(postExtractedText)
    .values({
      platform,
      postId: id,
      kind,
      model: kind === 'speech' ? SPEECH_VERSION : SCREEN_VERSION,
      contentHash: `parity-${kind}-${id}`,
      status: 'ok',
      text,
      language: 'en',
      createdAt: iso(1),
    })
    .run()
}

// ——— People ———

function seedPeople() {
  PEOPLE.forEach((p, i) => {
    db.insert(users)
      .values({
        id: p.id,
        username: p.username,
        role: p.role,
        displayName: p.displayName,
        usernameChosen: true,
        usernameChangeCount: 0,
        createdAt: sqliteTime(d(300 - i * 20)),
        approval: 'approved',
      })
      .run()
    // Pete has no email (board 8.1: "Add an email so you can always get back in").
    if (p.key !== 'pete') {
      db.insert(userIdentities)
        .values({ provider: 'email', providerId: `${p.username}@parity.test`, userId: p.id })
        .run()
      db.update(users)
        .set({ email: `${p.username}@parity.test` })
        .where(sql`${users.id} = ${p.id}`)
        .run()
    }
  })

  db.insert(serverSettings)
    .values({ key: 'invites.who', value: 'approve', updatedAt: iso(d(2)) })
    .run()

  const token = () => crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex')
  for (const inv of INVITES) {
    db.insert(invites)
      .values({
        id: inv.id,
        tokenHash: token(),
        createdBy: idOf(inv.by),
        createdAt: iso(inv.minutesAgo),
        expiresAt: NOW - inv.minutesAgo * 60_000 + inv.expiresInDays * 24 * 60 * 60_000 + 60_000,
      })
      .run()
  }

  // The join request: Jo's invite, used 10 minutes ago, waiting for Pete.
  db.insert(users)
    .values({
      id: PENDING.id,
      username: PENDING.username,
      displayName: PENDING.displayName,
      usernameChosen: true,
      usernameChangeCount: 0,
      createdAt: sqliteTime(PENDING.minutesAgo),
      approval: 'pending',
    })
    .run()
  db.insert(invites)
    .values({
      id: PENDING.inviteId,
      tokenHash: token(),
      createdBy: idOf(PENDING.invitedBy),
      createdAt: iso(PENDING.minutesAgo + 30),
      expiresAt: NOW + 6 * 24 * 60 * 60_000,
      usedBy: PENDING.id,
      usedAt: iso(PENDING.minutesAgo),
    })
    .run()
  db.insert(userIdentities)
    .values({ provider: 'invite', providerId: PENDING.inviteId, userId: PENDING.id })
    .run()
}

// ——— Saves ———

function tweetUrlFor(p: { platform: string; id: string; author: string }): string {
  if (p.platform === 'twitter') return `https://x.com/${p.author}/status/${p.id}`
  if (p.platform === 'instagram') return `https://www.instagram.com/reel/${p.id}/`
  if (p.platform === 'tiktok') return `https://www.tiktok.com/@${p.author}/video/${p.id}`
  return networkSourceUrl(p.platform, p.id, p.author) ?? `https://example.com/${p.platform}/${p.id}`
}

function insertSave(
  p: Pick<WorldPost, 'platform' | 'id' | 'author' | 'authorName' | 'text' | 'category'>,
  who: PersonKey,
  minutesAgo: number,
  isPrivate = false,
  note: string | null = null,
) {
  db.insert(bookmarks)
    .values({
      id: p.id,
      userId: idOf(who),
      platform: p.platform,
      author: p.author,
      authorName: p.authorName,
      text: p.text,
      tweetUrl: tweetUrlFor(p),
      createdAt: iso(minutesAgo + d(1)),
      processedAt: iso(minutesAgo),
      category: p.category,
      source: 'manual',
      isPrivate,
      note,
    })
    .run()
}

interface Filler {
  platform: 'twitter'
  id: string
  author: string
  authorName: null
  text: string
  category: 'photo'
  who: PersonKey
  topic: Topic
  /** A person's own filler, in no shared channel. */
  general?: boolean
}

let fillerSeq = 0
const fillerCounts = new Map<Topic, number>()

function makeFiller(who: PersonKey, topic: Topic): Filler {
  fillerSeq++
  const { subjects, twists } = FILLER_WORDS[topic]
  const n = fillerCounts.get(topic) ?? 0
  fillerCounts.set(topic, n + 1)
  // Every subject × twist pair once before any repeats.
  const subject = subjects[n % subjects.length]
  const twist = twists[Math.floor(n / subjects.length) % twists.length]
  const round = Math.floor(n / (subjects.length * twists.length))
  const text = `${subject} ${twist}${round > 0 ? `, take ${round + 1}` : ''}`
  return {
    platform: 'twitter',
    id: `18000000000000${String(fillerSeq).padStart(5, '0')}`,
    author: 'x',
    authorName: null,
    text,
    category: 'photo',
    who,
    topic,
  }
}

/** Filler: older than New's 14 days, so it never shows as new; it fills counts and channels. */
function fillerAgo(i: number): number {
  return d(16) + i * 600
}

const fillers: Filler[] = []
const groupFill = new Map<string, Filler[]>()
const madeFill = new Map<string, Filler[]>()

function planFillers() {
  for (const ch of GROUP_CHANNELS) {
    const list: Filler[] = []
    const need = ch.size - ch.heroes.length
    for (let i = 0; i < need; i++) list.push(makeFiller(ch.fillBy[i % ch.fillBy.length], ch.topic))
    groupFill.set(ch.slug, list)
    fillers.push(...list)
  }
  for (const ch of MADE_FOR_PETE) {
    const list: Filler[] = []
    for (let i = 0; i < ch.fill; i++) list.push(makeFiller('pete', ch.topic))
    madeFill.set(ch.slug, list)
    fillers.push(...list)
  }
  const general: Topic[] = [
    'animals',
    'food',
    'synths',
    'space',
    'oldnet',
    'style',
    'places',
    'joke',
    'work',
  ]
  for (const p of PEOPLE) {
    const heroSaves = POSTS.filter((w) => w.saves.some((s) => s.who === p.key)).length
    const have = fillers.filter((f) => f.who === p.key).length
    const need = p.totalSaves - heroSaves - have
    for (let i = 0; i < need; i++)
      fillers.push({
        ...makeFiller(p.key, general[(i + p.key.length) % general.length]),
        general: true,
      })
  }
}

function seedSaves() {
  for (const w of POSTS) {
    for (const s of w.saves) insertSave(w, s.who, s.minutesAgo, s.private, s.note ?? null)
  }
  fillers.forEach((f, i) => insertSave(f, f.who, fillerAgo(i)))
}

// ——— Kept media and /doing ———

async function seedKept(): Promise<Record<string, string[]>> {
  fs.rmSync(PARITY_MEDIA_DIR, { recursive: true, force: true })
  fs.mkdirSync(PARITY_MEDIA_DIR, { recursive: true })
  // Pin the KEEP_BACKFILL=off boundary far ahead: the keep worker runs (so
  // /doing shows keeping and retrying) but never claims or downloads anything.
  db.insert(keepSettings)
    .values({ key: 'backfill_cutoff', value: '2999-01-01T00:00:00.000Z' })
    .run()

  const placeholders: Record<string, string[]> = {}
  for (const w of POSTS) {
    if (w.media.length === 0) continue
    db.insert(keepJobs)
      .values({
        platform: w.platform,
        postId: w.id,
        status: 'running',
        attempts: 0,
        updatedAt: iso(1),
      })
      .run()
    const prepared = await prepareMedia(w)
    if (prepared.placeholders.length) placeholders[w.key] = prepared.placeholders
    await recordKept(w.platform, w.id, prepared.files)
  }

  const job = (key: string, values: Partial<typeof keepJobs.$inferInsert>) => {
    const w = post(key)
    db.insert(keepJobs)
      .values({
        platform: w.platform,
        postId: w.id,
        status: 'pending',
        attempts: 0,
        updatedAt: iso(1),
        ...values,
      })
      .onConflictDoUpdate({ target: [keepJobs.platform, keepJobs.postId], set: { ...values } })
      .run()
  }
  // Finished keeps read as "Ready" on /doing for 30 minutes after their
  // update: date each one to its newest save, so only fresh saves show there.
  for (const w of POSTS) {
    if (w.media.length === 0) continue
    const newest = Math.min(...w.saves.map((s) => s.minutesAgo))
    job(w.key, { status: 'done', updatedAt: iso(Math.max(0, newest - 1)) })
  }
  // Showcase screenshots show a settled server: none of the boards' jobs in flight.
  if (!showcaseEnabled()) {
    job(DOING.ready, { status: 'done', updatedAt: iso(2) })
    // Its files are here, but the job is still running at 62% (the percent the
    // worker last wrote): /doing shows it being kept and the theater shows
    // "Getting it ready" over it (board j1-4).
    job(DOING.keeping, { status: 'running', progress: 62, updatedAt: iso(1) })
    job(DOING.converting, { status: 'converting', updatedAt: iso(5) })
    job(DOING.needsYou, {
      status: 'unavailable',
      attempts: 1,
      lastError: 'This post is private (login required)',
      updatedAt: iso(19),
    })
    job(DOING.waiting, {
      status: 'failed',
      attempts: 1,
      lastError: 'Read timed out while asking Instagram',
      nextAttemptAt: new Date(NOW + 20 * 60_000).toISOString(),
      updatedAt: iso(2),
    })
    const listening = post(DOING.listening)
    db.insert(understandingQueue)
      .values({
        platform: listening.platform,
        postId: listening.id,
        kind: 'speech',
        priority: 10,
        attempts: 0,
        enqueuedAt: iso(3),
        nextAttemptAt: iso(3),
      })
      .run()
  }
  return placeholders
}

/** Each filler post keeps a copy of a hero's still for its topic (a single photo post). */
async function seedFillerMedia() {
  const stills = new Map<
    Topic,
    Array<{ file: string; width: number | null; height: number | null }>
  >()
  for (const [topic, refs] of Object.entries(FILLER_STILLS) as Array<
    [Topic, Array<{ post: string; slot: string }>]
  >) {
    const list = []
    for (const ref of refs) {
      const w = post(ref.post)
      const [row] = db.all<{ path: string; width: number | null; height: number | null }>(
        sql`SELECT path, width, height FROM kept_files WHERE platform = ${w.platform} AND post_id = ${w.id} AND slot = ${ref.slot}`,
      )
      if (row) list.push({ file: absolutePath(row.path), width: row.width, height: row.height })
    }
    stills.set(topic, list)
  }
  const used = new Map<Topic, number>()
  for (const f of fillers) {
    const pool = stills.get(f.topic) ?? []
    if (pool.length === 0) continue
    const n = used.get(f.topic) ?? 0
    used.set(f.topic, n + 1)
    const still = pool[n % pool.length]
    const out = path.join(
      PARITY_MEDIA_DIR,
      postDir(f.platform, f.id),
      `photo-1${path.extname(still.file)}`,
    )
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.copyFileSync(still.file, out, fs.constants.COPYFILE_FICLONE)
    db.insert(keepJobs)
      .values({
        platform: f.platform,
        postId: f.id,
        status: 'running',
        attempts: 0,
        updatedAt: iso(1),
      })
      .run()
    await recordKept(f.platform, f.id, [
      {
        slot: 'photo-1' as Slot,
        file: out,
        mime: 'image/jpeg',
        width: still.width,
        height: still.height,
      },
    ])
  }
  // Kept long ago, like the saves: keeps finished in the last 30 minutes show on /doing.
  fillers.forEach((f, i) => {
    db.update(keepJobs)
      .set({ updatedAt: iso(fillerAgo(i)) })
      .where(sql`${keepJobs.platform} = ${f.platform} AND ${keepJobs.postId} = ${f.id}`)
      .run()
  })
}

function seedUnderstanding() {
  POSTS.forEach((w, i) => {
    const ready = w.key === DOING.ready
    understand(w.platform, w.id, w.topic, i + 1, ready ? ['text', 'image', 'video'] : ['text'])
    if (w.speech) extracted(w.platform, w.id, 'speech', w.speech)
    if (w.screen) extracted(w.platform, w.id, 'screen', w.screen)
    if (ready && !w.speech) extracted(w.platform, w.id, 'speech', 'Never gonna give you up.')
    if (ready && !w.screen) extracted(w.platform, w.id, 'screen', 'Rick Astley')
  })
}

// ——— Channels ———

function visibleSaversOf(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of keys) {
    const [platform, ...rest] = key.split(':')
    const id = rest.join(':')
    const rows = db.all<{ user_id: string }>(
      sql`SELECT user_id FROM bookmarks WHERE platform = ${platform} AND id = ${id} AND is_private = 0`,
    )
    for (const r of rows) out[r.user_id] = (out[r.user_id] ?? 0) + 1
  }
  return out
}

function seedChannels() {
  const [{ n: visible }] = db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM bookmarks WHERE is_private = 0 AND COALESCE(source, '') != 'quoted'`,
  )
  GROUP_CHANNELS.forEach((ch, position) => {
    const keys = [
      ...ch.heroes.map((k) => `${post(k).platform}:${post(k).id}`),
      ...(groupFill.get(ch.slug) ?? []).map((f) => `${f.platform}:${f.id}`),
    ]
    db.insert(groupChannels)
      .values({
        slug: ch.slug,
        name: ch.name,
        size: keys.length,
        postKeys: JSON.stringify(keys),
        savers: JSON.stringify(visibleSaversOf(keys)),
        position,
        savesAtCompute: Number(visible),
        computedAt: PINNED_COMPUTE_AT,
        modelVersion: SEMANTIC_MODEL_VERSION,
      })
      .run()
  })

  const pete = person('pete')
  const [{ n: peteSaves }] = db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM bookmarks WHERE user_id = ${pete.id}`,
  )
  MADE_FOR_PETE.forEach((ch, position) => {
    const keys = [
      ...ch.heroes.map((k) => `${post(k).platform}:${post(k).id}`),
      ...(madeFill.get(ch.slug) ?? []).map((f) => `${f.platform}:${f.id}`),
    ]
    db.insert(autoChannels)
      .values({
        userId: pete.id,
        slug: ch.slug,
        name: ch.name,
        postKeys: JSON.stringify(keys),
        size: keys.length,
        position,
        model: SEMANTIC_MODEL_VERSION,
        savesAtCompute: Number(peteSaves),
        computedAt: PINNED_COMPUTE_AT,
      })
      .run()
  })
}

// ——— Seen ———

function seedViews() {
  const pete = person('pete')
  const seen = new Set<string>()
  const mark = (userId: string, platform: string, id: string, minutesAgo: number) => {
    const k = `${userId}:${platform}:${id}`
    if (seen.has(k)) return
    seen.add(k)
    db.insert(postViews)
      .values({ userId, platform, postId: id, seenAt: iso(minutesAgo) })
      .run()
  }
  // Pete has seen every filler post and a few heroes: New shows the other 12.
  fillers.forEach((f, i) => {
    if (f.who !== 'pete') mark(pete.id, f.platform, f.id, fillerAgo(i) - 60)
  })
  for (const key of PETE_SEEN) {
    const w = post(key)
    mark(pete.id, w.platform, w.id, 30)
  }
  // Everyone else has seen the filler too, so their New is the boards' recent posts.
  for (const p of PEOPLE) {
    if (p.key === 'pete') continue
    fillers.forEach((f, i) => {
      if (f.who !== p.key) mark(p.id, f.platform, f.id, fillerAgo(i) - 60)
    })
  }
}

// ——— Sent straight to Pete ———

function seedSends() {
  const w = post(SENT_TO_PETE.post)
  db.insert(postSends)
    .values({
      fromUserId: idOf(SENT_TO_PETE.from),
      toUserId: idOf('pete'),
      platform: w.platform,
      postId: w.id,
      note: null,
      createdAt: iso(SENT_TO_PETE.minutesAgo),
      seenAt: null,
    })
    .run()
}

// ——— Credentials ———

async function sessionFor(id: string, username: string): Promise<string> {
  return new SignJWT({ userId: id, username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET || PARITY_SESSION_SECRET))
}

async function writeCredentials(placeholders: Record<string, string[]>) {
  const members: Record<string, unknown> = {}
  for (const p of PEOPLE) {
    const keys: { name: string; key: string }[] = []
    // The real pairing flow: a code from Settings → Phone app, spent by the app.
    for (const name of p.phones) {
      const { code } = createPairCode(p.id)
      const redeemed = redeemPairCode(code, name)
      if (!redeemed.ok) throw new Error(`Pairing ${name} failed: ${redeemed.reason}`)
      keys.push({ name: redeemed.name, key: redeemed.key })
    }
    const session = await sessionFor(p.id, p.username)
    members[p.key] = {
      userId: p.id,
      username: p.username,
      displayName: p.displayName,
      role: p.role,
      session,
      cookie: `adhx_session=${session}`,
      phoneKey: keys[0].key,
      phoneName: keys[0].name,
      phones: keys,
    }
  }
  const credentials = {
    server: PARITY_PUBLIC_ORIGIN,
    cookieName: 'adhx_session',
    seededAt: new Date(NOW).toISOString(),
    mediaSource: usingMediaSource() ? parityMediaSource() : null,
    placeholders,
    members,
    pending: {
      userId: PENDING.id,
      username: PENDING.username,
      displayName: PENDING.displayName,
      note: 'Waiting for approval: signed out everywhere but /invite/waiting.',
      session: await sessionFor(PENDING.id, PENDING.username),
    },
    usage: {
      web: 'Cookie: adhx_session=<members.X.session> (or the `cookie` string as a Cookie header)',
      phone: 'Authorization: Bearer <members.X.phoneKey>',
    },
  }
  fs.mkdirSync(PARITY_OUT, { recursive: true })
  fs.writeFileSync(PARITY_CREDENTIALS, JSON.stringify(credentials, null, 2))
  console.log(`[parity] credentials → ${PARITY_CREDENTIALS}`)
}

export async function seedParityDb(): Promise<void> {
  if (showcaseEnabled()) await buildShowcaseMedia()
  seedPeople()
  planFillers()
  seedSaves()
  const placeholders = await seedKept()
  await seedFillerMedia()
  seedUnderstanding()
  seedChannels()
  seedViews()
  seedSends()
  seedAdminWorld(fillers.map((f) => ({ ...f, general: !!f.general })))
  await writeCredentials(placeholders)
  seedAdminPhones()
  const [{ n }] = db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM bookmarks`)
  console.log(
    `[parity] seeded ${PEOPLE.length} members, ${POSTS.length} posts + ${fillers.length} filler, ${n} saves` +
      (usingMediaSource() ? '' : ' (placeholder media: PARITY_MEDIA_SRC not set or missing)'),
  )
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedParityDb().then(
    () => process.exit(0),
    (error) => {
      console.error(error)
      process.exit(1)
    },
  )
}
