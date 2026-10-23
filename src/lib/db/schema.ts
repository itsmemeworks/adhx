import {
  sqliteTable,
  text,
  integer,
  blob,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm'

// ===========================================
// MULTI-USER SCHEMA - Composite Primary Keys
// ===========================================

// Main bookmarks table - PK: (userId, platform, id)
// `platform` is 'twitter' | 'instagram' | 'tiktok' or one of the link networks
// in src/lib/platform/networks.ts — so a TikTok video id (numeric, 19 digits)
// can't collide with a tweet id (also numeric, 18-19 digits).
// All bookmark-derived tables (tags/media/links/archived_posts)
// carry platform too so the foreign-key tuple matches. It's a free-text column
// (no enum/migration needed to add a platform).
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').notNull(), // Source-native ID (tweet id, reel shortcode, tiktok video id)
    userId: text('user_id').notNull(), // Owner of the bookmark
    platform: text('platform').notNull().default('twitter'), // 'twitter' | 'instagram' | 'tiktok'
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

    // Just for me: kept, searchable and playable by its owner, but no other
    // member sees it, counts it or is told who saved it.
    isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),

    // A few words for your people ("making this Sunday"), shown next to your
    // face to members only, never to strangers. Cleaned and capped at 140
    // characters (`cleanNote`); null when there's none.
    note: text('note'),

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

// Posts a member has seen in the feed (`post_views`): on stage for 2s, or
// skipped. New (`/api/feed/blend?mode=new`) plays only posts without a row;
// the blend also reads it for "close to you". PK: (userId, platform, postId).
// User-linked (account guard; cleared with the account). Rows older than 180
// days are pruned at migrate.
export const postViews = sqliteTable(
  'post_views',
  {
    userId: text('user_id').notNull(),
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    seenAt: text('seen_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.platform, table.postId] }),
    seenAtIdx: index('post_views_seen_at_idx').on(table.seenAt),
    postIdx: index('post_views_post_seen_idx').on(table.platform, table.postId, table.seenAt),
  }),
)

// How many times a member watched a post (`post_watch_counts`, DDL in
// src/lib/watch/schema-sql.ts): plays, finishes and seconds, added up per UTC
// year for Wrapped. PK: (userId, platform, postId, year). User-linked (account
// guard; cleared with the account). Never pruned.
export const postWatchCounts = sqliteTable(
  'post_watch_counts',
  {
    userId: text('user_id').notNull(),
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    year: integer('year').notNull(),
    plays: integer('plays').notNull().default(0),
    finishes: integer('finishes').notNull().default(0),
    seconds: integer('seconds').notNull().default(0),
    firstAt: text('first_at').notNull(),
    lastAt: text('last_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.platform, table.postId, table.year] }),
    postIdx: index('post_watch_counts_post_idx').on(table.platform, table.postId),
    userYearIdx: index('post_watch_counts_user_year_idx').on(table.userId, table.year),
  }),
)

// "Send straight to your people" (`post_sends`): one member sent a post to
// another. The recipient sees it first in New ("Pete sent you this") until
// `seen_at` (set when they see the post). PK: (fromUserId, toUserId,
// platform, postId). Both user columns are account-guarded; rows go with
// either account. DDL: `src/lib/sends/schema-sql.ts`.
export const postSends = sqliteTable(
  'post_sends',
  {
    fromUserId: text('from_user_id').notNull(),
    toUserId: text('to_user_id').notNull(),
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
    seenAt: text('seen_at'),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.fromUserId, table.toUserId, table.platform, table.postId],
    }),
    toIdx: index('post_sends_to_idx').on(table.toUserId, table.seenAt),
  }),
)

// "Tell me when it's live": a member's bell on a forming group (an engine
// id, carried across regroups and merges by `src/lib/moments/alerts.ts`).
export const momentAlertSubs = sqliteTable(
  'moment_alert_subs',
  {
    userId: text('user_id').notNull(),
    formingId: text('forming_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.formingId] }),
    formingIdx: index('moment_alert_subs_forming_idx').on(table.formingId),
  }),
)

// One alert per subscriber when their forming group goes live. Unseen ones
// are listed for 24 hours (`GET /api/moments/alerts`, `/api/app/alerts`).
export const momentAlerts = sqliteTable(
  'moment_alerts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    createdAt: text('created_at').notNull(),
    seenAt: text('seen_at'),
  },
  (table) => ({
    userIdx: index('moment_alerts_user_idx').on(table.userId, table.createdAt),
  }),
)

// Admin counts (DDL in src/lib/admin/schema-sql.ts). Reactions are counted per
// member, per UTC day, per kind (an emoji's id or 'text'); the words, the post
// and the moment are never stored.
export const reactionCounts = sqliteTable(
  'reaction_counts',
  {
    day: text('day').notNull(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.day, table.userId, table.kind] }),
    userIdx: index('reaction_counts_user_idx').on(table.userId, table.day),
  }),
)

// Reactions kept on posts (`post_reactions`): an emoji or a few words a
// member left on a post, shown (with names) only to members who can see the
// post, and replayed when they watch it. Live reactions are kept here too,
// with the id the room saw. User-linked; rows go with the account.
// DDL: `src/lib/reactions/schema-sql.ts`.
export const postReactions = sqliteTable(
  'post_reactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    emoji: text('emoji'),
    text: text('text'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    postIdx: index('post_reactions_post_idx').on(table.platform, table.postId, table.createdAt),
    userIdx: index('post_reactions_user_idx').on(table.userId),
  }),
)

// One row per live moment that formed. No user ids.
export const momentLog = sqliteTable(
  'moment_log',
  {
    slug: text('slug').primaryKey(),
    title: text('title').notNull(),
    formedAt: text('formed_at').notNull(),
    tuneIns: integer('tune_ins').notNull().default(0),
    peakWatching: integer('peak_watching').notNull().default(0),
    reactions: integer('reactions').notNull().default(0),
    alerts: integer('alerts').notNull().default(0),
    alertsOpened: integer('alerts_opened').notNull().default(0),
  },
  (table) => ({
    formedIdx: index('moment_log_formed_idx').on(table.formedAt),
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

// Sign-in links waiting for an admin to hand over (EMAIL_LINKS_TO_ADMIN, for
// a self-hosted ADHX with no email service). Holds the link itself, so rows
// live only as long as the admin-held login token (60 minutes) and go once it's used.
export const adminSignInLinks = sqliteTable('admin_sign_in_links', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(),
  url: text('url').notNull(),
  intent: text('intent').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
})

// Kept media: every saved post's files, downloaded once per post (not per
// saver) into MEDIA_DIR and served by /api/files. See src/lib/keep.
export const keepSettings = sqliteTable('keep_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// Server-wide settings an admin changes at runtime (who can invite, …).
// Environment variables only give the first default; see src/lib/settings/server.ts.
export const serverSettings = sqliteTable('server_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * Links shared from the phone app, saved in the background: the share sheet
 * gets an answer at once, and the post appears once it's read and kept.
 */
export const phoneSaveQueue = sqliteTable(
  'phone_save_queue',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** Stable per-share phone id; omitted by legacy clients. */
    requestId: text('request_id'),
    url: text('url').notNull(),
    /** waiting · working · saved · failed */
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: text('next_attempt_at'),
    /** Set once saved. */
    platform: text('platform'),
    postId: text('post_id'),
    alreadySaved: integer('already_saved', { mode: 'boolean' }).notNull().default(false),
    /** Shared as "Just for me": the save it makes is private. */
    isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
    /** Shared without saying, while the owner had "Just for me by default" on: a new save is private. */
    defaultPrivate: integer('default_private', { mode: 'boolean' }).notNull().default(false),
    /** Explicit choice, including false; null preserves repeat-save privacy. */
    privateChoice: integer('private_choice', { mode: 'boolean' }),
    /** New saves stay private until the phone acknowledges its intent. */
    publishPending: integer('publish_pending', { mode: 'boolean' }).notNull().default(false),
    /** Highest acknowledged phone intent; replay never overrides a later web edit. */
    privacyIntentVersion: integer('privacy_intent_version').notNull().default(0),
    /** The note shared with it (cleaned): '' clears an existing note; null leaves it. */
    note: text('note'),
    /** Set once failed: a code the apps know, and words fit to show. */
    errorCode: text('error_code'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusIdx: index('phone_save_queue_status_idx').on(table.status, table.nextAttemptAt),
    userIdx: index('phone_save_queue_user_id_idx').on(table.userId),
    requestIdx: uniqueIndex('phone_save_queue_request_idx').on(table.userId, table.requestId),
  }),
)

export const keepJobs = sqliteTable(
  'keep_jobs',
  {
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    /** pending · running · done · failed (retrying) · unavailable (gave up) */
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: text('next_attempt_at'),
    lastError: text('last_error'),
    /** Total bytes on disk for this post. */
    bytes: integer('bytes').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
    /** A saver chose "Keep the link only" for a job that gave up: it stops asking for them. */
    acceptedAt: text('accepted_at'),
    /**
     * Last download percent the worker wrote (0–99, in steps), so "Getting it
     * ready · 62%" survives the in-memory progress. Cleared on each claim.
     */
    progress: integer('progress'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.platform, table.postId] }),
    statusIdx: index('keep_jobs_status_idx').on(table.status, table.nextAttemptAt),
  }),
)

export const keptFiles = sqliteTable(
  'kept_files',
  {
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    /** `video-1`, `photo-2`, `audio-1`, `poster` */
    slot: text('slot').notNull(),
    /** Path under MEDIA_DIR. */
    path: text('path').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.platform, table.postId, table.slot] }),
  }),
)

// Personal access keys — read-only search from outside the browser (the adhx
// skill). Only a SHA-256 of the key is stored; the key itself is shown once.
export const accessKeys = sqliteTable(
  'access_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    /** Last four characters, so people can tell their keys apart. */
    hint: text('hint').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
    /** `search` (the adhx skill: read-only search) or `phone` (the phone app: save + status). */
    scope: text('scope').notNull().default('search'),
    /** A phone key's kind of phone, `ios` | `android`, once its requests say (null: not known). */
    platform: text('platform'),
  },
  (table) => ({
    userIdIdx: index('access_keys_user_id_idx').on(table.userId),
  }),
)

/** One-time codes that connect the phone app (Settings → Phone app). */
export const appPairCodes = sqliteTable('app_pair_codes', {
  codeHash: text('code_hash').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: integer('expires_at').notNull(), // epoch ms
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull(),
})

// Invite links (`/invite/<token>`): an admin, or any member with
// INVITES=members, makes one; the person who opens it picks a name and joins
// with no email. Only the token's SHA-256 is stored. Single use, 7 days, and
// revocable; `id` is the public handle for listing and revoking.
export const invites = sqliteTable(
  'invites',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(), // epoch ms
    usedBy: text('used_by'),
    usedAt: text('used_at'),
    revokedAt: text('revoked_at'),
    nameHint: text('name_hint'),
  },
  (table) => ({
    createdByIdx: index('invites_created_by_idx').on(table.createdBy),
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

// Understanding pipeline (`src/lib/semantic/`): EmbeddingGemma 2 vectors
// behind search-by-meaning, plus the durable work queue that produces them.
// Keyed by the POST, not the saver — only public post content is understood,
// so one row serves everyone who saved it. Per-user reads always join
// `bookmarks`. DDL lives in `src/lib/semantic/schema-sql.ts`.
export const postEmbeddings = sqliteTable(
  'post_embeddings',
  {
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    kind: text('kind').notNull(), // 'text' | 'image' | 'video'
    model: text('model').notNull(),
    contentHash: text('content_hash').notNull(),
    dims: integer('dims').notNull().default(0),
    vector: blob('vector', { mode: 'buffer' }),
    status: text('status').notNull().default('ok'), // 'ok' | 'none' | 'failed'
    error: text('error'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.platform, table.postId, table.kind] }),
    statusIdx: index('post_embeddings_status_idx').on(table.kind, table.status),
  }),
)

export const understandingQueue = sqliteTable(
  'understanding_queue',
  {
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    kind: text('kind').notNull(),
    priority: integer('priority').notNull().default(10),
    attempts: integer('attempts').notNull().default(0),
    enqueuedAt: text('enqueued_at').notNull(),
    nextAttemptAt: text('next_attempt_at').notNull(),
    lastError: text('last_error'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.platform, table.postId, table.kind] }),
    nextIdx: index('understanding_queue_next_idx').on(table.nextAttemptAt, table.priority),
  }),
)

// Words read out of a post's media (speech, text on screen), keyed by post.
// DDL lives in `src/lib/semantic/schema-sql.ts`.
export const postExtractedText = sqliteTable(
  'post_extracted_text',
  {
    platform: text('platform').notNull(),
    postId: text('post_id').notNull(),
    kind: text('kind').notNull(), // 'speech' | 'screen'
    model: text('model').notNull(),
    contentHash: text('content_hash').notNull(),
    status: text('status').notNull(), // 'ok' | 'none' | 'failed'
    text: text('text'),
    language: text('language'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.platform, table.postId, table.kind] }),
  }),
)

// "Made for you" channels: one user's saves grouped by meaning and named.
// Derived and private (never shown to anyone else); recomputed when stale.
// Keeping one turns it into an ordinary tag channel.
export const autoChannels = sqliteTable(
  'auto_channels',
  {
    userId: text('user_id').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** JSON array of `platform:id`, closest to the group's centre first. */
    postKeys: text('post_keys').notNull(),
    size: integer('size').notNull(),
    position: integer('position').notNull(),
    model: text('model').notNull(),
    /** The user's save count when computed (staleness check). */
    savesAtCompute: integer('saves_at_compute').notNull(),
    computedAt: text('computed_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.slug] }),
  }),
)

// "From everyone" channels: the whole server's visible saves (never private,
// quoted or a banned saver's) grouped by meaning and named, like Made for
// you. Server-wide and derived: no user_id. `savers` is a JSON object of
// saver user id -> posts in the channel at compute time; reads re-check every
// post's visible savers, so a deleted or banned account drops out at once.
export const groupChannels = sqliteTable('group_channels', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  /** JSON array of `platform:id`, closest to the group's centre first. */
  postKeys: text('post_keys').notNull(),
  savers: text('savers').notNull(),
  position: integer('position').notNull(),
  /** Visible saves on the server when computed (staleness check). */
  savesAtCompute: integer('saves_at_compute').notNull(),
  computedAt: text('computed_at').notNull(),
  modelVersion: text('model_version').notNull(),
})

export type PostEmbedding = typeof postEmbeddings.$inferSelect
export type PostExtractedText = typeof postExtractedText.$inferSelect
export type UnderstandingJob = typeof understandingQueue.$inferSelect
export type AutoChannel = typeof autoChannels.$inferSelect
export type GroupChannel = typeof groupChannels.$inferSelect

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
  // Whether this account may use the server: 'approved' (everyone before
  // join approvals existed), 'pending' (joined from a member's invite while
  // "Anyone, I approve" is on, waiting for an admin) or 'declined'. Anything
  // but approved is signed out everywhere except the waiting page and its
  // status endpoint (`getCurrentUserId`). See src/lib/auth/approval.ts.
  approval: text('approval').notNull().default('approved'),
  // "Not now" on a waiting join: hidden from the admin's queue until then (epoch ms).
  approvalSnoozedUntil: integer('approval_snoozed_until'),
  // When the person last used ADHX (a session or phone-key request), written
  // at most once every 5 minutes (src/lib/people/last-seen.ts). Admins only.
  lastSeenAt: text('last_seen_at'),
})

// Linked sign-in identities for a user — X OAuth and/or email magic link.
// PK (provider, providerId) means one provider identity cannot belong to two
// ADHX users. The partial unique index also limits each ADHX user to one X
// identity, matching oauth_tokens' one-row-per-user model; email identities
// remain unconstrained by user_id during atomic email changes.
export const userIdentities = sqliteTable(
  'user_identities',
  {
    provider: text('provider').notNull(), // 'x' | 'email' | 'invite'
    // X user id, lowercased email, or the invite id an account joined with
    providerId: text('provider_id').notNull(),
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
// This table stores only the sha256 hash. Admin delivery also retains the raw
// link in admin_sign_in_links until use/expiry; protect that table as credentials.
export const loginTokens = sqliteTable('login_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  email: text('email').notNull(), // lowercased
  intent: text('intent').notNull(), // 'signin' | 'change' | 'phone' (an emailed 6-digit code)
  userId: text('user_id'), // set for 'change' — the account confirming a new email; for 'phone', the account (null: no such account)
  returnTo: text('return_to'),
  expiresAt: integer('expires_at').notNull(), // epoch ms
  usedAt: text('used_at'),
  attempts: integer('attempts').notNull().default(0), // wrong 'phone' codes tried
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
export type Invite = typeof invites.$inferSelect
export type PostView = typeof postViews.$inferSelect
export type PostWatchCount = typeof postWatchCounts.$inferSelect
export type LoginToken = typeof loginTokens.$inferSelect
export type NewLoginToken = typeof loginTokens.$inferInsert
