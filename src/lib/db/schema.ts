import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

// ===========================================
// MULTI-USER SCHEMA - Composite Primary Keys
// ===========================================

// Main bookmarks table - PK: (userId, platform, id)
// `platform` is one of 'twitter' | 'instagram' | 'tiktok' | 'youtube' — added so
// a TikTok video id (numeric, 19 digits) can't collide with a tweet id (also
// numeric, 18-19 digits), and YouTube's 11-char id stays in its own namespace.
// All bookmark-derived tables (tags/media/links/archived_posts)
// carry platform too so the foreign-key tuple matches. It's a free-text column
// (no enum/migration needed to add a platform).
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').notNull(), // Source-native ID (tweet id, reel shortcode, tiktok video id)
    userId: text('user_id').notNull(), // Owner of the bookmark
    platform: text('platform').notNull().default('twitter'), // 'twitter' | 'instagram' | 'tiktok' | 'youtube'
    author: text('author').notNull(),
    authorName: text('author_name'),
    authorProfileImageUrl: text('author_profile_image_url'),
    text: text('text').notNull(),
    tweetUrl: text('tweet_url').notNull(), // Source URL (kept name for back-compat; works for any platform)
    createdAt: text('created_at'), // ISO timestamp from the source
    processedAt: text('processed_at').notNull(),
    category: text('category').default('tweet'),

    // Reply/Quote/Retweet context (Twitter-specific; null for IG/TikTok)
    isReply: integer('is_reply', { mode: 'boolean' }).default(false),
    replyContext: text('reply_context'),
    isQuote: integer('is_quote', { mode: 'boolean' }).default(false),
    quoteContext: text('quote_context'), // JSON (legacy)
    quotedTweetId: text('quoted_tweet_id'),
    isRetweet: integer('is_retweet', { mode: 'boolean' }).default(false),
    retweetContext: text('retweet_context'),

    // AI-generated summary
    summary: text('summary'),

    // How this bookmark was added: 'sync', 'manual', 'url_prefix', 'quoted'
    source: text('source').default('sync'),

    // Original JSON for debugging
    rawJson: text('raw_json'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.platform, table.id] }),
    userIdIdx: index('bookmarks_user_id_idx').on(table.userId),
    processedAtIdx: index('bookmarks_processed_at_idx').on(table.processedAt),
    // Composite indexes for common query patterns
    userIdProcessedAtIdx: index('bookmarks_user_processed_at_idx').on(
      table.userId,
      table.processedAt,
    ),
    userIdCategoryIdx: index('bookmarks_user_category_idx').on(table.userId, table.category),
    userIdPlatformIdx: index('bookmarks_user_platform_idx').on(table.userId, table.platform),
    platformIdIdx: index('bookmarks_platform_id_idx').on(table.platform, table.id),
    userIdQuotedTweetIdx: index('bookmarks_user_quoted_tweet_idx').on(
      table.userId,
      table.quotedTweetId,
    ),
  }),
)

// Links associated with bookmarks - includes userId + platform for FK lookup
export const bookmarkLinks = sqliteTable(
  'bookmark_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    platform: text('platform').notNull().default('twitter'),
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
    userBookmarkIdx: index('bookmark_links_user_bookmark_idx').on(
      table.userId,
      table.platform,
      table.bookmarkId,
    ),
    identityIdx: uniqueIndex('bookmark_links_identity_idx').on(
      table.userId,
      table.platform,
      table.bookmarkId,
      table.expandedUrl,
    ),
  }),
)

// Tags - PK: (userId, platform, bookmarkId, tag)
// Tags are per-bookmark-per-user; platform is part of the FK tuple.
export const bookmarkTags = sqliteTable(
  'bookmark_tags',
  {
    userId: text('user_id').notNull(),
    platform: text('platform').notNull().default('twitter'),
    bookmarkId: text('bookmark_id').notNull(),
    tag: text('tag').notNull(),
    /**
     * When this post was added to THIS tag — which is what a playlist shows and
     * orders by, and is NOT `bookmarks.processedAt` (when the curator first
     * saved the post, possibly long before they curated it into anything).
     * Owner: "when a user creates a tag and then adds a post into the tag, we
     * should use the time at which they added that post to the tag… users get
     * control over when they are creating things that are related to them."
     *
     * Nullable because the column was added to an existing table; `migrate.ts`
     * backfills old rows from the bookmark's own save time, the closest thing
     * that history has. Readers fall back the same way.
     */
    createdAt: text('created_at'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.platform, table.bookmarkId, table.tag] }),
    userIdIdx: index('bookmark_tags_user_id_idx').on(table.userId),
  }),
)

// Media attachments - PK: (userId, platform, id)
export const bookmarkMedia = sqliteTable(
  'bookmark_media',
  {
    id: text('id').notNull(), // {sourceId}_{mediaKey}
    userId: text('user_id').notNull(),
    platform: text('platform').notNull().default('twitter'),
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
    pk: primaryKey({ columns: [table.userId, table.platform, table.id] }),
    userBookmarkIdx: index('bookmark_media_user_bookmark_idx').on(
      table.userId,
      table.platform,
      table.bookmarkId,
    ),
  }),
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
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at'),
  refreshLeaseId: text('refresh_lease_id'),
  refreshLeaseStartedAt: text('refresh_lease_started_at'),
})

// OAuth state (for PKCE flow) — bound to the ADHX account that initiated it.
// The callback must present the same signed-in user before it can atomically
// consume the verifier, preventing a session switch from linking X elsewhere.
export const oauthState = sqliteTable('oauth_state', {
  state: text('state').primaryKey(),
  codeVerifier: text('code_verifier').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  xLinkVersion: integer('x_link_version').notNull().default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
})

// Archived posts — taken out of the active collection. PK: (userId, platform,
// bookmarkId). Was `read_status`/`read_at`, renamed when "read" became
// "archived" in the product; see the guarded rename in migrate.ts.
export const archivedPosts = sqliteTable(
  'archived_posts',
  {
    userId: text('user_id').notNull(),
    platform: text('platform').notNull().default('twitter'),
    bookmarkId: text('bookmark_id').notNull(),
    archivedAt: text('archived_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.platform, table.bookmarkId] }),
    userIdIdx: index('archived_posts_user_id_idx').on(table.userId),
  }),
)

// Tag shares - track which tags are shared publicly
export const tagShares = sqliteTable(
  'tag_shares',
  {
    userId: text('user_id').notNull(),
    tag: text('tag').notNull(),
    shareCode: text('share_code').notNull().unique(),
    isPublic: integer('is_public', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.tag] }),
    shareCodeIdx: index('tag_shares_share_code_idx').on(table.shareCode),
  }),
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
  }),
)

// Sync logs - PK: id (includes userId for filtering)
export const syncLogs = sqliteTable(
  'sync_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    startedAt: text('started_at').notNull(),
    heartbeatAt: text('heartbeat_at'),
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
    oneRunningPerUserIdx: uniqueIndex('sync_logs_one_running_per_user_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'running'`),
  }),
)

// Activity — the public "pulse" of community actions shown on the landing page.
// Append-only event log. `userId` is stored only for moderation / rate-limiting
// and is NEVER returned by the public /api/activity endpoint (the pulse is
// anonymous: "Someone saved …"). Content is always resolved server-side by the
// recorder — never accepted from the client — so it can't be used for injection.
export const activity = sqliteTable(
  'activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    action: text('action').notNull(), // 'preview' | 'save' | 'read' | 'share'
    platform: text('platform').notNull().default('twitter'),
    bookmarkId: text('bookmark_id').notNull(),
    author: text('author').notNull(),
    authorName: text('author_name'),
    authorAvatarUrl: text('author_avatar_url'),
    text: text('text'),
    thumbnailUrl: text('thumbnail_url'),
    // Server-resolved content type (video/photo/text/article) so
    // preview-only items (no saved bookmark to derive it from) still render the
    // right card. Saved items prefer the bookmark-derived type.
    contentType: text('content_type'),
    // Server-resolved short-link expansions for URLs in `text` (JSON array of
    // TextLinkRef, see src/lib/trending/query.ts) — so a preview-only post can
    // still avoid showing a raw t.co in the theater. Null when none/unresolved.
    textLinks: text('text_links'),
    // Server-resolved quoted-post reference (JSON TheaterQuoteRef, see
    // src/lib/trending/query.ts) for preview-only quote tweets. Null when the
    // post isn't a quote or the quote couldn't be resolved.
    quoteJson: text('quote_json'),
    url: text('url').notNull(),
    userId: text('user_id'), // private — never exposed publicly
    createdAt: text('created_at').notNull(),
    // Content-level moderation lever: 1 hides this row from every public read
    // path (getTrendingItems / /api/activity / /api/trending / the theater),
    // set via the admin-only POST /api/admin/activity/hide route. Does NOT
    // delete the row (append-only event log) and never touches the user's
    // own saved bookmark.
    hidden: integer('hidden').notNull().default(0),
  },
  (table) => ({
    createdAtIdx: index('activity_created_at_idx').on(table.createdAt),
    dedupeIdx: index('activity_dedupe_idx').on(
      table.action,
      table.platform,
      table.bookmarkId,
      table.createdAt,
    ),
    platformBookmarkHiddenIdx: index('activity_platform_bookmark_hidden_idx').on(
      table.platform,
      table.bookmarkId,
      table.hidden,
    ),
  }),
)

// Collection events — timestamped raw detail behind Discovery leaderboards
// (docs/specs/discovery-leaderboards.md §3). Collections are keyed by
// (ownerUserId, tag), not (platform, bookmarkId), so they get their own log
// rather than nullable columns on `activity`. Same invariants as `activity`:
// append-only while retained, with lifecycle-only pruning after 90 days
// (exempt from the composite-PK user-owned-data convention),
// `viewerId` stored for dedupe/moderation but NEVER exposed by any read path
// (every read goes through src/lib/discovery/rank.ts), recording is
// fire-and-forget, and `hidden` is the content-level moderation lever.
export const collectionEvents = sqliteTable(
  'collection_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    action: text('action').notNull(), // 'view' | 'clone' — future: 'item_view' | 'share'
    ownerUserId: text('owner_user_id').notNull(),
    tag: text('tag').notNull(),
    viewerId: text('viewer_id'), // private — never exposed publicly
    createdAt: text('created_at').notNull(),
    hidden: integer('hidden').notNull().default(0),
  },
  (table) => ({
    collectionIdx: index('collection_events_collection_idx').on(
      table.ownerUserId,
      table.tag,
      table.createdAt,
    ),
    createdAtIdx: index('collection_events_created_at_idx').on(table.createdAt),
  }),
)

// Durable all-time playlist totals. Raw collection_events are retained only
// long enough for finite-window ranking and dedupe; this table preserves the
// complete history without viewer identifiers or an unbounded event scan.
export const collectionAggregates = sqliteTable(
  'collection_aggregates',
  {
    ownerUserId: text('owner_user_id').notNull(),
    tag: text('tag').notNull(),
    viewCount: integer('view_count').notNull().default(0),
    cloneCount: integer('clone_count').notNull().default(0),
    lastEventAt: text('last_event_at'),
    hidden: integer('hidden').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.ownerUserId, table.tag] }),
    visibilityRecencyIdx: index('collection_aggregates_visibility_recency_idx').on(
      table.hidden,
      table.lastEventAt,
    ),
  }),
)

// Analytics events — private growth log. Append-only, like `activity`, but
// NEVER rendered on a public surface. Dimensions only (event name + platform
// / type / surface / source / ids). `userId` is stored for future
// rate-limiting and never selected by `/api/analytics`. Distinct from the
// pulse: tagging, archive, copy, open, auth, and shortcut clicks belong
// here so they can feed leaderboards later without flooding /trending.
export const analyticsEvents = sqliteTable(
  'analytics_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    platform: text('platform'),
    contentType: text('content_type'),
    surface: text('surface'),
    source: text('source'),
    bookmarkId: text('bookmark_id'),
    tag: text('tag'),
    userId: text('user_id'), // private — never exposed publicly
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    createdAtIdx: index('analytics_events_created_at_idx').on(table.createdAt),
    nameCreatedAtIdx: index('analytics_events_name_created_at_idx').on(table.name, table.createdAt),
    platformCreatedAtIdx: index('analytics_events_platform_created_at_idx').on(
      table.platform,
      table.createdAt,
    ),
  }),
)

// Moderated posts — durable public-visibility block for a (platform, id).
// Hiding a risky post writes here AND flips `activity.hidden` so every
// trending/pulse/sitemap path drops it. Preview pages tombstone + noindex
// when a row exists with hidden=1. Does NOT delete anyone's bookmark.
export const moderatedPosts = sqliteTable(
  'moderated_posts',
  {
    platform: text('platform').notNull(),
    bookmarkId: text('bookmark_id').notNull(),
    hidden: integer('hidden').notNull().default(1),
    reason: text('reason'),
    // Route-shape hint for content with no saved/activity row (notably /p/).
    contentType: text('content_type'),
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.platform, table.bookmarkId] }),
  }),
)

// Banned accounts — session + sign-in treated as signed-out. Public
// profile / playlist pages 404; leaderboards skip the owner. Data is kept
// so an unban restores access.
export const userBans = sqliteTable('user_bans', {
  userId: text('user_id').primaryKey(),
  reason: text('reason'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
})

// Admin action log — who hid/banned what. `actorUserId` is never exposed
// on a public surface; the admin overview lists actions, not raw ids.
export const adminAudit = sqliteTable(
  'admin_audit',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorUserId: text('actor_user_id').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    createdAtIdx: index('admin_audit_created_at_idx').on(table.createdAt),
  }),
)

// ===========================================
// ACCOUNTS - users + linked sign-in identities
// ===========================================

// First-class account row. `id` is either the X user id (X-first signups —
// matches the historical convention that `userId` == the X id everywhere
// else, e.g. bookmarks.userId) or a generated `u_<hex>` id (email-first
// signups). Everything else keys off this id via `userId`.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  // Authorization is attached to the immutable account id, never inferred
  // from the mutable/reclaimable username.
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  email: text('email'),
  // Whether the user has spent their first username-choice prompt
  // (`/welcome`, shown after first magic-link sign-in, or the claim
  // affordance in Settings for pre-existing accounts). X users get this set
  // true at backfill/creation — they already picked a handle on X. Defaults
  // to false so existing/new email users are only ever prompted once. The
  // first claim is free (doesn't count against `usernameChangeCount`) —
  // see `chooseUsername()` in `src/lib/auth/account.ts`.
  usernameChosen: integer('username_chosen', { mode: 'boolean' }).notNull().default(false),
  // Number of username changes spent AFTER the first free claim, capped at
  // `MAX_USERNAME_CHANGES` (2) in `chooseUsername()`. Every counted change
  // records the old name in `username_aliases` so old `/t/{username}/...`
  // links keep redirecting instead of 404ing.
  usernameChangeCount: integer('username_change_count').notNull().default(0),
  // Monotonic revocation generation for X-link flows. OAuth state captures
  // this value at start; disconnect increments it so callbacks already in
  // flight cannot recreate an identity or token row afterward.
  xLinkVersion: integer('x_link_version').notNull().default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
})

// Linked sign-in identities for a user — X OAuth and/or email magic link.
// PK (provider, providerId) means one provider identity cannot belong to two
// ADHX users. The partial unique index also limits each ADHX user to one X
// identity, matching oauth_tokens' one-row-per-user model; email identities
// remain unconstrained by user_id during atomic email changes.
export const userIdentities = sqliteTable(
  'user_identities',
  {
    provider: text('provider').notNull(), // 'x' | 'email'
    providerId: text('provider_id').notNull(), // X user id, or lowercased email
    userId: text('user_id').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerId] }),
    userIdIdx: index('user_identities_user_id_idx').on(table.userId),
    oneXPerUserIdx: uniqueIndex('user_identities_one_x_per_user_idx')
      .on(table.userId)
      .where(sql`${table.provider} = 'x'`),
  }),
)

// Redirect table for usernames a user has changed AWAY from (after their
// first free claim — see `users.usernameChosen`/`usernameChangeCount`
// above). `username` (lowercased) is the PK so a name can only ever redirect
// to one account at a time; reclaiming your own old name deletes its row
// (see `chooseUsername()`). Consumed by `src/lib/users/lookup.ts`
// (`resolveUsernameAlias`) so old `/t/{username}/...` links keep resolving
// via a permanent redirect instead of 404ing after a rename.
export const usernameAliases = sqliteTable('username_aliases', {
  username: text('username').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at').notNull(), // epoch ms
})

// One-time magic-link tokens for email sign-in / email-change confirmation.
// Only the sha256 hash is stored — the raw token exists only in the emailed
// URL, so a DB read (or leak) can never produce a usable login token.
export const loginTokens = sqliteTable('login_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(), // lowercased
  intent: text('intent').notNull(), // 'signin' | 'change'
  userId: text('user_id'), // set for 'change' — the account confirming a new email
  returnTo: text('return_to'),
  expiresAt: integer('expires_at').notNull(), // epoch ms
  usedAt: text('used_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
})

// ===========================================
// Relations
// ===========================================

export const bookmarksRelations = relations(bookmarks, ({ many, one }) => ({
  links: many(bookmarkLinks),
  tags: many(bookmarkTags),
  media: many(bookmarkMedia),
  archivedPost: one(archivedPosts),
}))

export const bookmarkLinksRelations = relations(bookmarkLinks, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkLinks.userId, bookmarkLinks.platform, bookmarkLinks.bookmarkId],
    references: [bookmarks.userId, bookmarks.platform, bookmarks.id],
  }),
}))

export const bookmarkTagsRelations = relations(bookmarkTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkTags.userId, bookmarkTags.platform, bookmarkTags.bookmarkId],
    references: [bookmarks.userId, bookmarks.platform, bookmarks.id],
  }),
}))

export const bookmarkMediaRelations = relations(bookmarkMedia, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkMedia.userId, bookmarkMedia.platform, bookmarkMedia.bookmarkId],
    references: [bookmarks.userId, bookmarks.platform, bookmarks.id],
  }),
}))

export const archivedPostsRelations = relations(archivedPosts, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [archivedPosts.userId, archivedPosts.platform, archivedPosts.bookmarkId],
    references: [bookmarks.userId, bookmarks.platform, bookmarks.id],
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
export type ArchivedPost = typeof archivedPosts.$inferSelect
export type NewArchivedPost = typeof archivedPosts.$inferInsert
export type UserPreference = typeof userPreferences.$inferSelect
export type NewUserPreference = typeof userPreferences.$inferInsert
export type SyncLog = typeof syncLogs.$inferSelect
export type NewSyncLog = typeof syncLogs.$inferInsert
export type TagShare = typeof tagShares.$inferSelect
export type NewTagShare = typeof tagShares.$inferInsert
export type Activity = typeof activity.$inferSelect
export type NewActivity = typeof activity.$inferInsert
export type CollectionEvent = typeof collectionEvents.$inferSelect
export type NewCollectionEvent = typeof collectionEvents.$inferInsert
export type CollectionAggregate = typeof collectionAggregates.$inferSelect
export type NewCollectionAggregate = typeof collectionAggregates.$inferInsert
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert
export type ModeratedPost = typeof moderatedPosts.$inferSelect
export type NewModeratedPost = typeof moderatedPosts.$inferInsert
export type UserBan = typeof userBans.$inferSelect
export type NewUserBan = typeof userBans.$inferInsert
export type AdminAudit = typeof adminAudit.$inferSelect
export type NewAdminAudit = typeof adminAudit.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserIdentity = typeof userIdentities.$inferSelect
export type NewUserIdentity = typeof userIdentities.$inferInsert
export type LoginToken = typeof loginTokens.$inferSelect
export type NewLoginToken = typeof loginTokens.$inferInsert
