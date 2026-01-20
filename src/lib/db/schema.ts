import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

// ===========================================
// MULTI-USER SCHEMA - Composite Primary Keys
// ===========================================

// Main bookmarks table - PK: (userId, id)
// Each user has their own copy of bookmarks
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').notNull(), // Tweet ID
    userId: text('user_id').notNull(), // Owner of the bookmark
    author: text('author').notNull(),
    authorName: text('author_name'),
    authorProfileImageUrl: text('author_profile_image_url'),
    text: text('text').notNull(),
    tweetUrl: text('tweet_url').notNull(),
    createdAt: text('created_at'), // ISO timestamp from Twitter
    processedAt: text('processed_at').notNull(),
    category: text('category').default('tweet'),

    // Reply/Quote/Retweet context
    isReply: integer('is_reply', { mode: 'boolean' }).default(false),
    replyContext: text('reply_context'),
    isQuote: integer('is_quote', { mode: 'boolean' }).default(false),
    quoteContext: text('quote_context'), // JSON (legacy)
    quotedTweetId: text('quoted_tweet_id'),
    isRetweet: integer('is_retweet', { mode: 'boolean' }).default(false),
    retweetContext: text('retweet_context'),

    // Content extraction
    extractedContent: text('extracted_content'),

    // Filing status
    filedPath: text('filed_path'),
    needsTranscript: integer('needs_transcript', { mode: 'boolean' }).default(false),

    // AI-generated summary
    summary: text('summary'),

    // How this bookmark was added: 'sync', 'manual', 'url_prefix'
    source: text('source').default('sync'),

    // Original JSON for debugging
    rawJson: text('raw_json'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.id] }),
    userIdIdx: index('bookmarks_user_id_idx').on(table.userId),
    processedAtIdx: index('bookmarks_processed_at_idx').on(table.processedAt),
    // Composite indexes for common query patterns
    userIdProcessedAtIdx: index('bookmarks_user_processed_at_idx').on(table.userId, table.processedAt),
    userIdCategoryIdx: index('bookmarks_user_category_idx').on(table.userId, table.category),
    userIdQuotedTweetIdx: index('bookmarks_user_quoted_tweet_idx').on(table.userId, table.quotedTweetId),
  })
)

// Links associated with bookmarks - includes userId for queries
export const bookmarkLinks = sqliteTable(
  'bookmark_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(), // For easy filtering
    bookmarkId: text('bookmark_id').notNull(),
    originalUrl: text('original_url'),
    expandedUrl: text('expanded_url').notNull(),
    linkType: text('link_type'),
    domain: text('domain'),
    contentJson: text('content_json'),
    previewTitle: text('preview_title'),
    previewDescription: text('preview_description'),
    previewImageUrl: text('preview_image_url'),
  },
  (table) => ({
    userBookmarkIdx: index('bookmark_links_user_bookmark_idx').on(table.userId, table.bookmarkId),
  })
)

// Tags - PK: (userId, bookmarkId, tag)
// Each user has their own tags for their bookmarks
export const bookmarkTags = sqliteTable(
  'bookmark_tags',
  {
    userId: text('user_id').notNull(),
    bookmarkId: text('bookmark_id').notNull(),
    tag: text('tag').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.bookmarkId, table.tag] }),
    userIdIdx: index('bookmark_tags_user_id_idx').on(table.userId),
  })
)

// Media attachments - PK: (userId, id)
// Each user has their own media records
export const bookmarkMedia = sqliteTable(
  'bookmark_media',
  {
    id: text('id').notNull(), // {tweetId}_{mediaKey}
    userId: text('user_id').notNull(),
    bookmarkId: text('bookmark_id').notNull(),
    mediaType: text('media_type').notNull(),
    originalUrl: text('original_url').notNull(),
    previewUrl: text('preview_url'),
    localPath: text('local_path'),
    thumbnailPath: text('thumbnail_path'),
    downloadStatus: text('download_status').default('pending'),
    downloadedAt: text('downloaded_at'),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    fileSizeBytes: integer('file_size_bytes'),
    altText: text('alt_text'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.id] }),
    userBookmarkIdx: index('bookmark_media_user_bookmark_idx').on(table.userId, table.bookmarkId),
  })
)

// OAuth tokens storage - PK: userId (one token per user)
export const oauthTokens = sqliteTable('oauth_tokens', {
  userId: text('user_id').primaryKey(),
  username: text('username'),
  profileImageUrl: text('profile_image_url'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: integer('expires_at').notNull(),
  scopes: text('scopes'),
  createdAt: text('created_at').default(new Date().toISOString()),
  updatedAt: text('updated_at'),
})

// OAuth state (for PKCE flow) - temporary, no userId needed
export const oauthState = sqliteTable('oauth_state', {
  state: text('state').primaryKey(),
  codeVerifier: text('code_verifier').notNull(),
  createdAt: text('created_at').default(new Date().toISOString()),
})

// Sync state tracking - PK: (userId, key)
export const syncState = sqliteTable(
  'sync_state',
  {
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    value: text('value'),
    updatedAt: text('updated_at'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.key] }),
  })
)

// Read status - PK: (userId, bookmarkId)
// Each user has their own read/unread status
export const readStatus = sqliteTable(
  'read_status',
  {
    userId: text('user_id').notNull(),
    bookmarkId: text('bookmark_id').notNull(),
    readAt: text('read_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.bookmarkId] }),
    // Index for counting read items per user
    userIdIdx: index('read_status_user_id_idx').on(table.userId),
  })
)

// Collections - PK: id (collections are user-owned)
export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    icon: text('icon'),
    shareCode: text('share_code').unique(),
    isPublic: integer('is_public', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at'),
  },
  (table) => ({
    userIdIdx: index('collections_user_id_idx').on(table.userId),
  })
)

// Tweets in collections - PK: (userId, collectionId, bookmarkId)
export const collectionTweets = sqliteTable(
  'collection_tweets',
  {
    userId: text('user_id').notNull(),
    collectionId: text('collection_id').notNull(),
    bookmarkId: text('bookmark_id').notNull(),
    addedAt: text('added_at').default(sql`CURRENT_TIMESTAMP`),
    notes: text('notes'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.collectionId, table.bookmarkId] }),
  })
)

// User preferences - PK: (userId, key)
export const userPreferences = sqliteTable(
  'user_preferences',
  {
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    value: text('value'),
    updatedAt: text('updated_at'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.key] }),
  })
)

// Sync logs - PK: id (includes userId for filtering)
export const syncLogs = sqliteTable(
  'sync_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    status: text('status').notNull(),
    totalFetched: integer('total_fetched').default(0),
    newBookmarks: integer('new_bookmarks').default(0),
    duplicatesSkipped: integer('duplicates_skipped').default(0),
    categorized: integer('categorized').default(0),
    errorMessage: text('error_message'),
    triggerType: text('trigger_type'),
  },
  (table) => ({
    userIdIdx: index('sync_logs_user_id_idx').on(table.userId),
  })
)

// ===========================================
// Gamification Tables
// ===========================================

// User gamification stats - tracks streaks, XP, level, lifetime metrics
export const userGamification = sqliteTable('user_gamification', {
  userId: text('user_id').primaryKey(),
  currentStreak: integer('current_streak').default(0),
  longestStreak: integer('longest_streak').default(0),
  lastActiveDate: text('last_active_date'), // ISO date (YYYY-MM-DD)
  totalXp: integer('total_xp').default(0),
  level: integer('level').default(1),
  lifetimeRead: integer('lifetime_read').default(0),
  lifetimeBookmarked: integer('lifetime_bookmarked').default(0),
  lifetimeTagged: integer('lifetime_tagged').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at'),
})

// Unlocked achievements - tracks when users unlock achievements
export const userAchievements = sqliteTable(
  'user_achievements',
  {
    id: text('id').notNull(), // nanoid
    userId: text('user_id').notNull(),
    achievementId: text('achievement_id').notNull(), // e.g., 'first_hundred', 'speed_reader'
    unlockedAt: text('unlocked_at').default(sql`CURRENT_TIMESTAMP`),
    progress: integer('progress').default(0), // For partial progress tracking
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.achievementId] }),
    userIdIdx: index('user_achievements_user_id_idx').on(table.userId),
  })
)

// User profiles for public display
export const userProfiles = sqliteTable('user_profiles', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name'),
  bio: text('bio'), // max 160 chars (enforced in app)
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  showStats: integer('show_stats', { mode: 'boolean' }).default(true),
  showAchievements: integer('show_achievements', { mode: 'boolean' }).default(true),
  featuredCollectionId: text('featured_collection_id'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at'),
})

// Follower relationships
export const userFollows = sqliteTable(
  'user_follows',
  {
    followerId: text('follower_id').notNull(),
    followingId: text('following_id').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.followerId, table.followingId] }),
    followerIdx: index('user_follows_follower_idx').on(table.followerId),
    followingIdx: index('user_follows_following_idx').on(table.followingId),
  })
)

// ===========================================
// Relations
// ===========================================

export const bookmarksRelations = relations(bookmarks, ({ many, one }) => ({
  links: many(bookmarkLinks),
  tags: many(bookmarkTags),
  media: many(bookmarkMedia),
  readStatus: one(readStatus),
  collectionTweets: many(collectionTweets),
}))

export const bookmarkLinksRelations = relations(bookmarkLinks, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkLinks.userId, bookmarkLinks.bookmarkId],
    references: [bookmarks.userId, bookmarks.id],
  }),
}))

export const bookmarkTagsRelations = relations(bookmarkTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkTags.userId, bookmarkTags.bookmarkId],
    references: [bookmarks.userId, bookmarks.id],
  }),
}))

export const bookmarkMediaRelations = relations(bookmarkMedia, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkMedia.userId, bookmarkMedia.bookmarkId],
    references: [bookmarks.userId, bookmarks.id],
  }),
}))

export const readStatusRelations = relations(readStatus, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [readStatus.userId, readStatus.bookmarkId],
    references: [bookmarks.userId, bookmarks.id],
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
    fields: [collectionTweets.userId, collectionTweets.bookmarkId],
    references: [bookmarks.userId, bookmarks.id],
  }),
}))

// ===========================================
// Type exports
// ===========================================

export type Bookmark = typeof bookmarks.$inferSelect
export type NewBookmark = typeof bookmarks.$inferInsert
export type BookmarkLink = typeof bookmarkLinks.$inferSelect
export type NewBookmarkLink = typeof bookmarkLinks.$inferInsert
export type BookmarkTag = typeof bookmarkTags.$inferSelect
export type NewBookmarkTag = typeof bookmarkTags.$inferInsert
export type BookmarkMedia = typeof bookmarkMedia.$inferSelect
export type NewBookmarkMedia = typeof bookmarkMedia.$inferInsert
export type OAuthToken = typeof oauthTokens.$inferSelect
export type ReadStatus = typeof readStatus.$inferSelect
export type NewReadStatus = typeof readStatus.$inferInsert
export type Collection = typeof collections.$inferSelect
export type NewCollection = typeof collections.$inferInsert
export type CollectionTweet = typeof collectionTweets.$inferSelect
export type UserPreference = typeof userPreferences.$inferSelect
export type NewUserPreference = typeof userPreferences.$inferInsert
export type SyncLog = typeof syncLogs.$inferSelect
export type NewSyncLog = typeof syncLogs.$inferInsert
export type SyncState = typeof syncState.$inferSelect
export type UserGamification = typeof userGamification.$inferSelect
export type NewUserGamification = typeof userGamification.$inferInsert
export type UserAchievement = typeof userAchievements.$inferSelect
export type NewUserAchievement = typeof userAchievements.$inferInsert
export type UserProfile = typeof userProfiles.$inferSelect
export type NewUserProfile = typeof userProfiles.$inferInsert
export type UserFollow = typeof userFollows.$inferSelect
export type NewUserFollow = typeof userFollows.$inferInsert
