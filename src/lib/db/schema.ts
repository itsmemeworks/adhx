import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

// Main bookmarks table
export const bookmarks = sqliteTable('bookmarks', {
  id: text('id').primaryKey(), // Tweet ID
  userId: text('user_id'), // Owner of the bookmark (nullable for migration)
  author: text('author').notNull(),
  authorName: text('author_name'),
  authorProfileImageUrl: text('author_profile_image_url'), // Profile avatar URL
  text: text('text').notNull(),
  tweetUrl: text('tweet_url').notNull(),
  createdAt: text('created_at'), // ISO timestamp from Twitter
  processedAt: text('processed_at').notNull(),
  category: text('category').default('tweet'), // article or tweet (used for article filter)

  // Reply/Quote/Retweet context (stored as JSON)
  isReply: integer('is_reply', { mode: 'boolean' }).default(false),
  replyContext: text('reply_context'), // JSON
  isQuote: integer('is_quote', { mode: 'boolean' }).default(false),
  quoteContext: text('quote_context'), // JSON (legacy, for backwards compat)
  quotedTweetId: text('quoted_tweet_id'), // Reference to the quoted tweet's bookmark ID
  isRetweet: integer('is_retweet', { mode: 'boolean' }).default(false),
  retweetContext: text('retweet_context'), // JSON: { author, authorName, text, media, tweetId }

  // Content extraction
  extractedContent: text('extracted_content'), // JSON

  // Filing status
  filedPath: text('filed_path'),
  needsTranscript: integer('needs_transcript', { mode: 'boolean' }).default(false),

  // AI-generated summary
  summary: text('summary'),

  // Original JSON for debugging
  rawJson: text('raw_json'),
})

// Links associated with bookmarks
export const bookmarkLinks = sqliteTable('bookmark_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  bookmarkId: text('bookmark_id')
    .notNull()
    .references(() => bookmarks.id, { onDelete: 'cascade' }),
  originalUrl: text('original_url'),
  expandedUrl: text('expanded_url').notNull(),
  linkType: text('link_type'), // tweet, video, image, media, link
  domain: text('domain'),
  contentJson: text('content_json'), // Extracted content
  // Article preview data (from Twitter card / Open Graph)
  previewTitle: text('preview_title'),
  previewDescription: text('preview_description'),
  previewImageUrl: text('preview_image_url'),
})

// Tags from bookmark folders
export const bookmarkTags = sqliteTable(
  'bookmark_tags',
  {
    bookmarkId: text('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.bookmarkId, table.tag] }),
  })
)

// Media attachments
export const bookmarkMedia = sqliteTable('bookmark_media', {
  id: text('id').primaryKey(), // {tweetId}_{index}
  bookmarkId: text('bookmark_id')
    .notNull()
    .references(() => bookmarks.id, { onDelete: 'cascade' }),
  mediaType: text('media_type').notNull(), // photo, video, animated_gif
  originalUrl: text('original_url').notNull(),
  previewUrl: text('preview_url'),
  localPath: text('local_path'),
  thumbnailPath: text('thumbnail_path'),
  downloadStatus: text('download_status').default('pending'), // pending, downloading, completed, failed
  downloadedAt: text('downloaded_at'),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  fileSizeBytes: integer('file_size_bytes'),
  altText: text('alt_text'),
})

// OAuth tokens storage
export const oauthTokens = sqliteTable('oauth_tokens', {
  userId: text('user_id').primaryKey(),
  username: text('username'),
  profileImageUrl: text('profile_image_url'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: integer('expires_at').notNull(), // Unix timestamp
  scopes: text('scopes'),
  createdAt: text('created_at').default(new Date().toISOString()),
  updatedAt: text('updated_at'),
})

// OAuth state (for PKCE flow)
export const oauthState = sqliteTable('oauth_state', {
  state: text('state').primaryKey(),
  codeVerifier: text('code_verifier').notNull(),
  createdAt: text('created_at').default(new Date().toISOString()),
})

// Sync state tracking (per user)
export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  userId: text('user_id'), // Owner of sync state (nullable for migration)
  value: text('value'),
  updatedAt: text('updated_at'),
})

// ===========================================
// ADHX v1.0 - Tables
// ===========================================

// Read status for tracking which bookmarks have been read
export const readStatus = sqliteTable('read_status', {
  bookmarkId: text('bookmark_id')
    .primaryKey()
    .references(() => bookmarks.id, { onDelete: 'cascade' }),
  readAt: text('read_at').notNull(),
})

// Collections (groups of bookmarks)
export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  userId: text('user_id'), // Owner of the collection (nullable for migration)
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'), // UI color (hex or tailwind color)
  icon: text('icon'), // Icon name
  shareCode: text('share_code').unique(), // Public share link code
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at'),
})

// Tweets in collections (many-to-many)
export const collectionTweets = sqliteTable(
  'collection_tweets',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    bookmarkId: text('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    addedAt: text('added_at').default(sql`CURRENT_TIMESTAMP`),
    notes: text('notes'), // Optional notes for this tweet in this collection
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionId, table.bookmarkId] }),
  })
)

// User preferences (key-value store, per user)
export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id'), // Owner of preference (nullable for migration, becomes part of key)
  key: text('key').primaryKey(), // TODO: Make composite PK with userId after migration
  value: text('value'),
  updatedAt: text('updated_at'),
})

// Sync logs for tracking sync history
export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'), // Owner of sync log (nullable for migration)
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  status: text('status').notNull(), // 'running' | 'completed' | 'failed'
  totalFetched: integer('total_fetched').default(0),
  newBookmarks: integer('new_bookmarks').default(0),
  duplicatesSkipped: integer('duplicates_skipped').default(0),
  categorized: integer('categorized').default(0),
  errorMessage: text('error_message'),
  triggerType: text('trigger_type'), // 'manual' | 'scheduled'
})

// Define relations
export const bookmarksRelations = relations(bookmarks, ({ many, one }) => ({
  links: many(bookmarkLinks),
  tags: many(bookmarkTags),
  media: many(bookmarkMedia),
  readStatus: one(readStatus),
  collectionTweets: many(collectionTweets),
}))

export const bookmarkLinksRelations = relations(bookmarkLinks, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkLinks.bookmarkId],
    references: [bookmarks.id],
  }),
}))

export const bookmarkTagsRelations = relations(bookmarkTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkTags.bookmarkId],
    references: [bookmarks.id],
  }),
}))

export const bookmarkMediaRelations = relations(bookmarkMedia, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkMedia.bookmarkId],
    references: [bookmarks.id],
  }),
}))

// v2.0 Relations
export const readStatusRelations = relations(readStatus, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [readStatus.bookmarkId],
    references: [bookmarks.id],
  }),
}))

export const collectionsRelations = relations(collections, ({ many }) => ({
  tweets: many(collectionTweets),
}))

export const collectionTweetsRelations = relations(collectionTweets, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionTweets.collectionId],
    references: [collections.id],
  }),
  bookmark: one(bookmarks, {
    fields: [collectionTweets.bookmarkId],
    references: [bookmarks.id],
  }),
}))

// Type exports
export type Bookmark = typeof bookmarks.$inferSelect
export type NewBookmark = typeof bookmarks.$inferInsert
export type BookmarkLink = typeof bookmarkLinks.$inferSelect
export type BookmarkTag = typeof bookmarkTags.$inferSelect
export type BookmarkMedia = typeof bookmarkMedia.$inferSelect
export type OAuthToken = typeof oauthTokens.$inferSelect
export type ReadStatus = typeof readStatus.$inferSelect
export type Collection = typeof collections.$inferSelect
export type NewCollection = typeof collections.$inferInsert
export type CollectionTweet = typeof collectionTweets.$inferSelect
export type UserPreference = typeof userPreferences.$inferSelect
export type SyncLog = typeof syncLogs.$inferSelect
export type NewSyncLog = typeof syncLogs.$inferInsert
