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
  tagShares,
  userIdentities,
  users,
} from '../src/lib/db/schema'
import {
  CLONE_TAG,
  COLLECTION_POSTS,
  CURATOR_POSTS,
  E2E_CURATOR_ID,
  E2E_CURATOR_USERNAME,
  E2E_USER_ID,
  E2E_USERNAME,
  LIVE_POSTS,
  ONE_ITEM_TAG,
  PLAYLIST_TAG,
  POST,
  PRIVATE_TAG,
  TIKTOK_TWIN,
} from './constants'

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
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
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedE2eDb()
}
