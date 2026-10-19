/**
 * Populate data/e2e.db after migrate. Run with DATABASE_PATH already set
 * (imports `@/lib/db` which reads that env at module load).
 */
import { db } from '../src/lib/db'
import {
  activity,
  bookmarkTags,
  bookmarks,
  collectionEvents,
  postEmbeddings,
  tagShares,
  userIdentities,
  users,
} from '../src/lib/db/schema'
import { SEMANTIC_DIMS, SEMANTIC_MODEL_VERSION } from '../src/lib/semantic/config'
import { normalize, toBlob } from '../src/lib/semantic/vectors'
import {
  CLONE_TAG,
  COLLECTION_POSTS,
  CURATOR_POSTS,
  E2E_CURATOR_ID,
  E2E_CURATOR_USERNAME,
  E2E_USER_ID,
  E2E_USERNAME,
  FROG_LIVE,
  FROG_POSTS,
  FROG_SAVER_IDS,
  FROG_TUNE_IN,
  LIVE_POSTS,
  ONE_ITEM_TAG,
  PLAYLIST_TAG,
  POST,
  PRIVATE_TAG,
  TIKTOK_TWIN,
  type E2ePost,
} from './constants'

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

// ——— "Right now" ———
// No model runs in e2e (SEMANTIC_SEARCH=off), so posts get synthetic
// vectors: one topic is an axis plus a little deterministic noise, the same
// shape as the moments unit tests.

function noise(seed: number): Float32Array {
  const v = new Float32Array(SEMANTIC_DIMS)
  let t = seed * 9973 + 1
  for (let i = 0; i < SEMANTIC_DIMS; i++) {
    t = (t * 16807) % 2147483647
    v[i] = (t / 2147483647 - 0.5) * 0.12
  }
  return v
}

function topic(axis: number, seed: number): Float32Array {
  const v = noise(seed)
  v[axis] += 1
  return normalize(v)
}

/** A `text` vector row, written the way `saveEmbedding` writes one. */
function understood(id: string, vector: Float32Array): void {
  db.insert(postEmbeddings)
    .values({
      platform: 'twitter',
      postId: id,
      kind: 'text',
      model: SEMANTIC_MODEL_VERSION,
      contentHash: `e2e-${id}`,
      dims: SEMANTIC_DIMS,
      vector: toBlob(vector),
      status: 'ok',
      createdAt: new Date().toISOString(),
    })
    .run()
}

function seedUser(id: string, username: string, displayName: string): void {
  const email = `${username}@example.com`
  db.insert(users)
    .values({ id, username, displayName, email, usernameChosen: true, usernameChangeCount: 0 })
    .run()
  db.insert(userIdentities).values({ provider: 'email', providerId: email, userId: id }).run()
}

function seedSave(userId: string, post: E2ePost, minutesAgo: number): void {
  db.insert(bookmarks)
    .values({
      id: post.id,
      userId,
      platform: 'twitter',
      author: post.author,
      authorName: post.authorName,
      text: post.text,
      tweetUrl: `https://x.com/${post.author}/status/${post.id}`,
      createdAt: isoMinutesAgo(minutesAgo + 60),
      processedAt: isoMinutesAgo(minutesAgo),
      category: 'tweet',
      source: 'manual',
    })
    .run()
}

/**
 * One moment ("Frog": six posts, two people, saved hours ago so they read
 * as "Saved 3h ago") among 40 unrelated posts one person saved today.
 * FROG_LIVE / FROG_TUNE_IN have vectors but no saver yet.
 */
function seedMoments(): void {
  const [frogA, frogB] = FROG_SAVER_IDS
  seedUser(frogA, 'e2efroga', 'E2E Frog A')
  seedUser(frogB, 'e2efrogb', 'E2E Frog B')

  FROG_POSTS.forEach((post, i) => {
    seedSave(frogA, post, 120 + i * 30)
    if (i < 3) seedSave(frogB, post, 110 + i * 30)
    understood(post.id, topic(0, i + 1))
  })
  understood(FROG_LIVE.id, topic(0, 7))
  understood(FROG_TUNE_IN.id, topic(0, 8))

  for (let i = 0; i < 40; i++) {
    const post: E2ePost = {
      id: `90000000000000070${String(i).padStart(2, '0')}`,
      author: `e2ebg${i}`,
      authorName: `E2E Bg ${i}`,
      text: `E2E-BG-${i}`,
    }
    seedSave(frogA, post, 90 + i * 20)
    understood(post.id, topic(10 + i, 200 + i))
  }
}

export function seedE2eDb(): void {
  db.insert(users)
    .values({
      id: E2E_USER_ID,
      username: E2E_USERNAME,
      displayName: 'E2E User',
      email: 'e2e@example.com',
      usernameChosen: true,
      usernameChangeCount: 0,
    })
    .run()

  db.insert(userIdentities)
    .values({
      provider: 'email',
      providerId: 'e2e@example.com',
      userId: E2E_USER_ID,
    })
    .run()

  COLLECTION_POSTS.forEach((post, index) => {
    db.insert(bookmarks)
      .values({
        id: post.id,
        userId: E2E_USER_ID,
        platform: 'twitter',
        author: post.author,
        authorName: post.authorName,
        text: post.text,
        tweetUrl: `https://x.com/${post.author}/status/${post.id}`,
        createdAt: isoMinutesAgo(30 + index),
        processedAt: isoMinutesAgo(index),
        category: 'tweet',
        source: 'manual',
      })
      .run()
  })

  db.insert(bookmarks)
    .values({
      id: TIKTOK_TWIN.id,
      userId: E2E_USER_ID,
      platform: 'tiktok',
      author: TIKTOK_TWIN.author,
      authorName: TIKTOK_TWIN.authorName,
      text: TIKTOK_TWIN.text,
      tweetUrl: `https://www.tiktok.com/@${TIKTOK_TWIN.author}/video/${TIKTOK_TWIN.id}`,
      createdAt: isoMinutesAgo(40),
      processedAt: isoMinutesAgo(20),
      category: 'tweet',
      source: 'manual',
    })
    .run()

  // Newest-tagged first on the playlist stage: Charlie, Bravo, Alpha.
  const playlistOrder: Array<{ post: (typeof POST)[keyof typeof POST]; minutesAgo: number }> = [
    { post: POST.charlie, minutesAgo: 1 },
    { post: POST.bravo, minutesAgo: 2 },
    { post: POST.alpha, minutesAgo: 3 },
  ]
  for (const { post, minutesAgo } of playlistOrder) {
    db.insert(bookmarkTags)
      .values({
        userId: E2E_USER_ID,
        platform: 'twitter',
        bookmarkId: post.id,
        tag: PLAYLIST_TAG,
        createdAt: isoMinutesAgo(minutesAgo),
      })
      .run()
  }

  db.insert(bookmarkTags)
    .values({
      userId: E2E_USER_ID,
      platform: 'twitter',
      bookmarkId: POST.delta.id,
      tag: ONE_ITEM_TAG,
      createdAt: isoMinutesAgo(4),
    })
    .run()

  db.insert(bookmarkTags)
    .values({
      userId: E2E_USER_ID,
      platform: 'twitter',
      bookmarkId: POST.echo.id,
      tag: PRIVATE_TAG,
      createdAt: isoMinutesAgo(5),
    })
    .run()

  db.insert(tagShares)
    .values([
      {
        userId: E2E_USER_ID,
        tag: PLAYLIST_TAG,
        shareCode: 'e2e-share-pl',
        isPublic: true,
      },
      {
        userId: E2E_USER_ID,
        tag: ONE_ITEM_TAG,
        shareCode: 'e2e-share-one',
        isPublic: true,
      },
      {
        userId: E2E_USER_ID,
        tag: PRIVATE_TAG,
        shareCode: 'e2e-share-priv',
        isPublic: false,
      },
    ])
    .run()

  LIVE_POSTS.forEach((post, index) => {
    db.insert(activity)
      .values({
        action: 'preview',
        platform: 'twitter',
        bookmarkId: post.id,
        author: post.author,
        authorName: post.authorName,
        text: post.text,
        url: `/${post.author}/status/${post.id}`,
        userId: E2E_USER_ID,
        createdAt: isoMinutesAgo(index),
        contentType: 'text',
        hidden: 0,
      })
      .run()
  })

  db.insert(users)
    .values({
      id: E2E_CURATOR_ID,
      username: E2E_CURATOR_USERNAME,
      displayName: 'E2E Curator',
      email: 'curator@example.com',
      usernameChosen: true,
      usernameChangeCount: 0,
    })
    .run()

  db.insert(userIdentities)
    .values({
      provider: 'email',
      providerId: 'curator@example.com',
      userId: E2E_CURATOR_ID,
    })
    .run()

  CURATOR_POSTS.forEach((post, index) => {
    db.insert(bookmarks)
      .values({
        id: post.id,
        userId: E2E_CURATOR_ID,
        platform: 'twitter',
        author: post.author,
        authorName: post.authorName,
        text: post.text,
        tweetUrl: `https://x.com/${post.author}/status/${post.id}`,
        createdAt: isoMinutesAgo(50 + index),
        processedAt: isoMinutesAgo(10 + index),
        category: 'tweet',
        source: 'manual',
      })
      .run()
    db.insert(bookmarkTags)
      .values({
        userId: E2E_CURATOR_ID,
        platform: 'twitter',
        bookmarkId: post.id,
        tag: CLONE_TAG,
        createdAt: isoMinutesAgo(index + 1),
      })
      .run()
  })

  db.insert(tagShares)
    .values({
      userId: E2E_CURATOR_ID,
      tag: CLONE_TAG,
      shareCode: 'e2e-share-clone',
      isPublic: true,
    })
    .run()

  // A non-self view so /leaderboard has something to rank this week.
  db.insert(collectionEvents)
    .values({
      action: 'view',
      ownerUserId: E2E_USER_ID,
      tag: PLAYLIST_TAG,
      viewerId: E2E_CURATOR_ID,
      createdAt: isoMinutesAgo(2),
      hidden: 0,
    })
    .run()

  seedMoments()
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedE2eDb()
}
