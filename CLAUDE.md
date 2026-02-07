# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local Configuration

Create `./CLAUDE.local.md` for personal settings that won't be committed:

```markdown
# Example CLAUDE.local.md

## GitHub CLI
Always use the `your-username` account for gh commands.

## Sentry CLI
Use org `your-org` and project `your-project`.

## Personal Notes
- My test user ID: user_abc123
- Local dev URL: http://localhost:3000
```

**Use cases for `CLAUDE.local.md`:**
- CLI tool credentials (GitHub, Sentry, Fly.io accounts)
- Personal test data and user IDs
- Local environment URLs and ports
- Workflow preferences specific to you
- Notes that shouldn't affect other contributors

---

## ADHX

**Save now. Read never. Find always.**

A Twitter/X bookmark manager for people who bookmark everything and read nothing. Built with Next.js 15.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  BROWSER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Landing Page          Main Feed              URL Prefix Feature            │
│  ┌─────────────┐      ┌─────────────┐        ┌─────────────────────┐       │
│  │ /           │      │ / (auth'd)  │        │ /{user}/status/{id} │       │
│  │ Marketing   │      │ FeedGrid    │        │ Quick-save tweet    │       │
│  │ OAuth Start │      │ Lightbox    │        │ → Add & redirect    │       │
│  └─────────────┘      │ FilterBar   │        └─────────────────────┘       │
│                       └─────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEXT.JS API ROUTES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Auth                    Data                      Media                     │
│  ┌──────────────┐       ┌──────────────┐         ┌──────────────┐          │
│  │ /auth/twitter│       │ /api/feed    │         │ /api/media/  │          │
│  │ /auth/callback       │ /api/sync    │◄──SSE   │   video      │          │
│  │ /auth/status │       │ /api/tweets/ │         └──────┬───────┘          │
│  └──────┬───────┘       │   add        │                │                   │
│         │               │ /api/bookmarks               │                   │
│         │               └──────┬───────┘                │                   │
│         │                      │                        │                   │
└─────────┼──────────────────────┼────────────────────────┼───────────────────┘
          │                      │                        │
          ▼                      ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│   Twitter API   │    │  SQLite + Drizzle│    │    FxTwitter API    │
│   (OAuth 2.0)   │    │                  │    │ (Media proxy/embed) │
│                 │    │  bookmarks       │    │                     │
│  • Auth tokens  │    │  bookmark_media  │    │  • Video URLs       │
│  • User info    │    │  bookmark_tags   │    │  • Photo URLs       │
│  • Bookmarks    │    │  read_status     │    │  • Tweet enrichment │
│                 │    │  sync_logs       │    │                     │
└─────────────────┘    └─────────────────┘    └─────────────────────┘
```

**Data Flow:**
1. **Sync**: Twitter API → Process tweets → SQLite (via `/api/sync` SSE stream)
2. **Add**: URL → FxTwitter enrichment → SQLite (via `/api/tweets/add`)
3. **View**: SQLite → Feed API → React components
4. **Media**: FxTwitter proxy → Video/Photo display (bypasses Twitter CORS)

## Quick Start

```bash
pnpm install
pnpm dev         # Start dev server at localhost:3000
pnpm build       # Production build
pnpm test        # Run all 719 tests (41 test files)
```

## Tech Stack

- **Framework**: Next.js 15.5 (App Router) + React 19
- **Database**: SQLite via better-sqlite3 + Drizzle ORM 0.45
- **Styling**: Tailwind CSS 3.4 + clsx + tailwind-merge
- **Twitter API**: twitter-api-v2 with OAuth 2.0 PKCE
- **Auth**: JWT-signed session cookies (jose)
- **Monitoring**: Sentry (error tracking + metrics)
- **Icons**: lucide-react
- **Fonts**: Indie Flower (brand), IBM Plex Sans/Inter/Lexend/Atkinson Hyperlegible (body - user selectable)
- **Testing**: Vitest
- **Deployment**: Fly.io with automated deploys via GitHub Actions

## Security

### Session Management
Sessions use JWT signing via `jose` library to prevent tampering:
- Cookie name: `adhx_session`
- Signed with `SESSION_SECRET` or `TWITTER_CLIENT_SECRET`
- 30-day expiration
- httpOnly, secure (in production), sameSite: lax

### Authentication
All data-modifying endpoints require authentication via `getCurrentUserId()`:
```typescript
import { getCurrentUserId } from '@/lib/auth/session'

const userId = await getCurrentUserId()
if (!userId) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Database
- Uses Drizzle ORM query builder (never raw SQL with interpolation)
- All queries filter by `userId` for multi-user data isolation
- **Multi-user schema**: All user-owned tables use composite primary keys `(userId, id)` to allow multiple users to bookmark the same tweet independently
- **Transactions**: Use `runInTransaction()` from `@/lib/db` for atomic multi-table operations. Inside transactions, use synchronous `.run()` instead of `await`:

```typescript
import { db, runInTransaction } from '@/lib/db'

// Atomic multi-table operation
runInTransaction(() => {
  db.delete(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.bookmarkId, id))).run()
  db.delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, id))).run()
})
```

See `src/app/api/bookmarks/[id]/route.ts` and `src/app/api/account/clear/route.ts` for examples.

### Token Encryption
OAuth tokens are encrypted at rest using AES-256-GCM:
- **Key file**: `src/lib/auth/token-encryption.ts`
- Encryption key derived from `SESSION_SECRET` or `TWITTER_CLIENT_SECRET`
- Each token gets a unique IV (initialization vector)
- Stored format: `iv:authTag:ciphertext` (base64 encoded)

```typescript
import { encryptToken, decryptToken } from '@/lib/auth/token-encryption'

const encrypted = encryptToken(accessToken)  // Store this in DB
const decrypted = decryptToken(encrypted)    // Use this for API calls
```

### Content Security Policy (CSP)
Security headers configured in `next.config.js`:
- `script-src 'self' 'unsafe-inline'` — no `unsafe-eval` (only needed by React Refresh in dev, not production)
- `style-src 'self' 'unsafe-inline'` — required for Tailwind CSS
- Prevents clickjacking with `frame-ancestors 'none'`
- Blocks mixed content
- Configured for Twitter/X embed compatibility

**Do NOT add `'unsafe-eval'`** — it enables `eval()` and is a major XSS escalation vector.

### SSRF Protection
All media proxy endpoints validate URLs against a strict domain allowlist before fetching. **Never use `.includes()` for domain validation** — it allows bypass via `domain.evil.com`.

```typescript
// ❌ WRONG: allows twimg.com.evil.com
if (hostname.includes('twimg.com')) { ... }

// ✅ CORRECT: exact match + endsWith with dot prefix
const isAllowed = hostname === 'video.twimg.com'
  || hostname.endsWith('.twimg.com')
  || hostname === 'twitter.com'
  || hostname.endsWith('.twitter.com')
```

This pattern is used in:
- `src/app/api/media/video/route.ts` — video proxy (allowlist array)
- `src/app/api/media/video/hls/route.ts` — HLS playlist proxy
- `src/app/api/media/video/hls/segment/route.ts` — HLS segment proxy

### Multi-User Query Safety
When querying tables with `userId`, never include `isNull(userId)` fallbacks for "legacy" data. This leaks data across users:

```typescript
// ❌ WRONG: includes other users' NULL-userId rows
.where(or(eq(table.userId, userId), isNull(table.userId)))

// ✅ CORRECT: strict user isolation
.where(eq(table.userId, userId))
```

### Health Check Endpoint
`/api/health` provides monitoring for Fly.io and external health checks:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-04T17:34:51.608Z",
  "version": "1.18.0",
  "checks": {
    "database": { "status": "healthy", "responseTime": "0ms" }
  }
}
```
Returns 503 if database is unreachable.

### Error Tracking & Metrics (Sentry)
Error tracking and user behavior metrics via Sentry SDK 10.x (server-side only, `@sentry/node`).

**Key file**: `src/lib/sentry.ts`

**Configuration**:
- `tracesSampleRate: 0.2` — 20% sampling to avoid quota issues at scale
- `enabled` only in production (`NODE_ENV === 'production'`)
- **PII protection**: User IDs are hashed before sending as metric attributes (never send raw `userId` to third parties)

```typescript
import { captureException, metrics } from '@/lib/sentry'

// Capture errors with context
captureException(error, { userId, endpoint: '/api/sync' })

// Track user behavior
metrics.authCompleted(isNewUser)
metrics.syncCompleted(bookmarksCount, pagesCount, durationMs)
metrics.bookmarkReadToggled(true)
metrics.feedSearched(hasResults, resultCount)
metrics.trackUser(userId) // Hashes userId internally
```

**Available metrics**:
- `auth.*` - OAuth flow tracking (started, completed, failed)
- `sync.*` - Sync operations (started, completed, failed, duration)
- `bookmark.*` - User interactions (read_toggled, tagged, added, deleted)
- `feed.*` - Feed usage (loaded, searched, filtered)
- `users.daily_active` - DAU tracking (uses `user_hash`, not raw ID)

**Error Boundaries**:
- `src/app/error.tsx` — catches page-level React errors (client component). Server-side errors are captured by Sentry Node SDK before reaching this boundary. Client-only React errors log to console but aren't sent to Sentry (no `@sentry/browser` installed).
- `src/app/global-error.tsx` — catches root layout crashes. Must provide its own `<html>` and `<body>` tags since the layout itself may have failed. Uses inline styles (no Tailwind available).

## Resilience Patterns

### External Fetch Timeouts
All server-side `fetch()` calls to external services **must** include `signal: AbortSignal.timeout()`. Without timeouts, a hanging CDN connection exhausts Fly.io's connection pool.

```typescript
// API calls: 10 second timeout
await fetch(url, { signal: AbortSignal.timeout(10_000) })

// Large file downloads: 30 second timeout
await fetch(videoUrl, { signal: AbortSignal.timeout(30_000) })
```

Applied in all media proxy routes:
- `src/app/api/media/video/download/route.ts` — 10s for API, 30s for video
- `src/app/api/media/video/hls/route.ts` — 10s for playlist
- `src/app/api/media/video/hls/segment/route.ts` — 10s for segment

### Migration Safety
Database migrations (`src/lib/db/migrate.ts`) run at container startup. Each migration statement is wrapped in try/catch — on failure, the migration tag and error are logged, then `process.exit(1)` stops the container with a clear message rather than an opaque crash.

## Architecture

### URL Prefix Feature
Users can save tweets by visiting `adhx.com/{username}/status/{id}`:
- Route: `src/app/[username]/status/[id]/page.tsx`
- Authenticated: Adds tweet, redirects to `/?open={id}` (opens lightbox)
- Unauthenticated: Shows `TweetPreviewLanding` with rich preview or `QuickAddLanding` as fallback

**Preview page layout** (`src/components/TweetPreviewLanding.tsx`):
- Tweet card with engagement stats, expand/collapse, and **Share** button (clipboard copy / Web Share API)
- CTA: "Save this tweet" (unauthenticated) or "Add to Collection" (authenticated)
- "Preview another tweet" URL input (positioned right after CTA for discoverability)
- Benefits list (One place for everything, Media at your fingertips, etc.)

**OG Image Selection** (`getOgImage()` in `src/lib/utils/og-image.ts`):
When generating Open Graph metadata for social unfurling, images are selected in priority order:
1. Direct media (tweet's own photos/video thumbnails)
2. Article cover image (X Articles `tweet.article.cover_media.media_info.original_img_url`)
3. Quote tweet media (when parent has no media, use quoted tweet's photos/videos)
4. External link thumbnail (`tweet.external.thumbnail_url`)
5. Fallback to `/og-logo.png` for text-only tweets

### Branding Assets

| File | Size | Purpose |
|------|------|---------|
| `public/logo.png` | 940KB | App logo for favicon and in-app display |
| `public/og-logo.png` | 183KB, 1200×630 | OG image for social sharing (homepage + tweet fallback) |
| `public/icon-192.png` | 36KB | PWA icon (small) |
| `public/icon-512.png` | 166KB | PWA icon (large) |

**OG Image Routes:**
- `src/app/opengraph-image.tsx` - Serves `og-logo.png` for homepage OG
- `src/app/twitter-image.tsx` - Serves `og-logo.png` for Twitter cards

**Key distinction**: `logo.png` is the app logo (used on website/favicon). `og-logo.png` is the branded OG image (1200×630) used for all social sharing previews.

### LLM-Friendly Previews & Structured Data
- Public tweet JSON API (`/api/share/tweet/[username]/[id]`) — clean cacheable JSON with author, engagement stats, media, article content as markdown. 5-min cache headers. `<link rel="alternate" type="application/json">` on preview pages points to this endpoint.
- JSON-LD structured data (`SocialMediaPosting` schema) on preview pages — author, interaction stats, images, video objects
- Enhanced OG tags: 280-char descriptions with engagement suffixes ("1.4K likes, 84 reposts"), `article:author`, `article:published_time`, `twitter:creator`
- Article tweets use the article title as OG title (instead of `@username: "title" - Save to ADHX`)
- Semantic HTML: tweet card in `<article data-content="tweet">` with `<header>`/`<footer>`, CTA section `role="complementary"`

**Article Text Utility** (`src/lib/utils/article-text.ts`):
- `articleBlocksToMarkdown()` converts X Article content blocks to clean markdown
- Handles headings, paragraphs, images, tweets, and dividers

**Tweet API Enrichment (`adhxContext`)**:
The public tweet JSON API enriches responses with ADHX curation context when the tweet exists in the local database:
- `savedByCount` — number of distinct ADHX users who bookmarked this tweet (no user IDs exposed)
- `publicTags` — list of public tag collections containing this tweet (tag name, curator username, URL)
- `previewUrl` — canonical ADHX preview URL for the tweet
- Only appears when `savedByCount > 0`; private tags are never included

Key files:
- `src/app/api/share/tweet/[username]/[id]/route.ts` — Public tweet JSON API + `adhxContext` enrichment
- `src/lib/utils/article-text.ts` — Article content block → markdown conversion

### LLM Discovery (`llms.txt`)
`public/llms.txt` follows the [llmstxt.org](https://llmstxt.org/) standard. Declares ADHX's public APIs, content types, and usage patterns for AI agents. Served as a static file at `/llms.txt`.

### Dynamic Sitemap
`src/app/sitemap.ts` generates a dynamic sitemap including:
- Homepage (priority 1)
- All public tag collection pages at `/t/{username}/{tag}` (priority 0.7, daily)
- All tweet preview URLs from public tags at `/{author}/status/{id}` (priority 0.5, weekly)
- Tweet URLs are deduplicated across multiple tags
- Private tags and their tweets are never included
- Falls back to homepage-only if database queries fail (e.g., during static build)

`public/robots.txt` includes `Allow: /t/` and `Allow: /api/share/` to explicitly permit crawling of public content routes while keeping `/api/` disallowed for authenticated endpoints.

### Save Methods (Platform-Aware)
The app offers multiple ways to save tweets, shown contextually based on the user's platform:

| Platform | Primary Method | Fallback |
|----------|---------------|----------|
| iOS | iOS Shortcut (Share Sheet) | URL prefix trick |
| Desktop | Bookmarklet (drag to toolbar) | URL prefix trick |
| Android | Bookmarklet + PWA Share Target | URL prefix trick |

**Platform detection** (`src/lib/platform.ts`):
- `isIOSDevice()`, `isAndroidDevice()`, `getPlatformType()` → `'ios' | 'android' | 'desktop'`
- SSR-safe (returns `'desktop'` when `window` is undefined)
- Components use `useState` + `useEffect` to detect platform client-side

**iOS Shortcut:**
- Shortcut ID: `0d187480099b4d34a745ec8750a4587b`
- iCloud URL: `https://www.icloud.com/shortcuts/0d187480099b4d34a745ec8750a4587b`
- Transforms `x.com/user/status/123` → `adhx.com/user/status/123`

**Bookmarklet** (desktop + Android):
```
javascript:void(location.href=location.href.replace(/(?:x|twitter)\.com/,'adhx.com'))
```
- One-click URL rewrite from x.com/twitter.com to adhx.com
- Shown with copy-to-clipboard button and drag-to-toolbar instructions
- No auth needed — redirects to preview page which handles auth/unauth

**PWA Share Target** (Android):
- `public/manifest.json` includes `share_target` config: `action: "/share"`, `method: "GET"`, `params: { url: "url" }`
- `src/app/share/page.tsx` — client component that parses the shared URL, extracts username/id, redirects to `/{username}/status/{id}`
- Shows "Not a tweet link" error for invalid URLs with link back to homepage
- URL parsing utility: `src/lib/utils/parse-share-url.ts`

**Implementation files:**
- `src/lib/platform.ts` — Platform detection utilities
- `src/components/LandingPage.tsx` — `ShortcutPromo` component (platform-aware)
- `src/app/settings/SettingsClient.tsx` — `ShortcutCard` component (platform-aware)
- `src/app/share/page.tsx` — PWA Share Target landing page
- `src/lib/utils/parse-share-url.ts` — Tweet URL parsing for share target

### Typography & Reading Preferences
ADHD-friendly font system with user selection:
- **Brand font**: Indie Flower (playful handwritten)
- **Body fonts** (user selectable in Settings):
  - IBM Plex Sans - Clean, professional
  - Inter - Neutral, familiar
  - Lexend - Designed for ADHD/reading difficulties
  - Atkinson Hyperlegible - Maximum letter differentiation

Files:
- `src/lib/preferences-context.tsx` - Font preference state & FONT_OPTIONS
- `src/components/FontProvider.tsx` - Applies selected font to document
- `src/app/globals.css` - Font CSS rules

Additional reading aids:
- **Bionic Reading** - Bolds first part of each word to guide eyes

### UI Patterns

**Mobile Input Zoom Prevention:**
iOS Safari auto-zooms when focusing inputs with `font-size < 16px`. Use responsive classes to maintain 16px on mobile while allowing smaller fonts on desktop:
```tsx
// ❌ Causes zoom on iOS
className="text-xs ..."

// ✅ 16px on mobile, 12px on sm+
className="text-base sm:text-xs ..."
```

**Cross-Component Keyboard Feedback:**
When keyboard shortcuts in `page.tsx` need to trigger UI feedback in child components (like button animations), use custom events:
```tsx
// In page.tsx (keyboard handler)
window.dispatchEvent(new CustomEvent('trigger-share'))

// In child component
useEffect(() => {
  const handler = () => triggerAnimation()
  window.addEventListener('trigger-share', handler)
  return () => window.removeEventListener('trigger-share', handler)
}, [])
```
This avoids prop drilling and keeps keyboard logic centralized while allowing distributed UI responses.

### Main Feed (`src/app/page.tsx`)
Client component with:
- **FeedGrid**: Masonry gallery with FeedCard components
- **Lightbox**: Full-screen modal with keyboard navigation (←→, R/U for read/unread, Esc)
- **FilterBar**: Category filters and search

### Quote Tweet Handling
Quote tweets display embedded content showing the quoted tweet. Two data sources:
- `quotedTweet`: Full `FeedItem` when the quoted tweet exists in user's collection
- `quoteContext`: Fallback JSON blob with basic info (author, text, thumbnail) when not in collection

**Lightbox rendering:**
- `TextLightboxContent`: Shows `TextQuoteContent` for text-only quote tweets
- `MediaLightboxContent`: Shows `QuoteCard` (compact) alongside media content
- `QuoteCard` component handles both data sources with `compact` prop for sizing

**Keyboard navigation:**
- `Q` key: Navigate to quoted tweet (if in collection, otherwise opens on X)
- `P` key: Navigate to parent tweet (tweets that quote the current one)

Files:
- `src/components/feed/Lightbox.tsx` - QuoteCard, TextQuoteContent components
- `src/components/feed/types.ts` - FeedItem.quotedTweet, FeedItem.quoteContext types

### Tag Sharing with Friendly URLs
Users can share tag collections publicly via human-readable URLs:
- **URL format**: `/t/{username}/{tag}` (e.g., `/t/weedauwl/claude-code`)
- **Route**: `src/app/t/[username]/[tag]/page.tsx`
- **API**: `src/app/api/share/tag/by-name/[username]/[tag]/route.ts`

**Sharing flow:**
1. User selects a tag in FilterBar and clicks "Make Public"
2. API creates/updates `tagShares` record and returns friendly URL
3. URL copied to clipboard automatically
4. Anyone with the URL can view the collection
5. Authenticated users can clone the collection to their account

**Clone endpoint**: `/api/share/tag/by-name/[username]/[tag]/clone`
- Copies all bookmarks, media, and links to the cloning user's account
- Adds the tag to all cloned bookmarks
- Skips bookmarks the user already has

### Tag Sanitization
Tags are sanitized before storage to ensure URL-safe, consistent naming:
- **Utility**: `src/lib/utils/tag.ts`
- Lowercase conversion
- Invalid characters replaced with hyphens
- Multiple hyphens collapsed
- Leading/trailing hyphens removed
- Maximum 10 characters (truncated, not rejected)

```typescript
import { sanitizeTag } from '@/lib/utils/tag'

sanitizeTag('Test Tag!')     // → 'test-tag'
sanitizeTag('Claude Code')   // → 'claude-cod' (truncated to 10)
sanitizeTag('AI/ML')         // → 'ai-ml'
```

**UI Preview**: The `TagInput` component shows a real-time preview of the sanitized tag as users type (e.g., "Test Tag!" → "→ test-tag").

### Landing Page Optimization
When unauthenticated, the app shows a landing page without making authenticated API calls:
- `page.tsx` checks `isAuthenticated` before fetching feed
- `Header.tsx` only fetches stats/cooldown after auth is confirmed
- `preferences-context.tsx` checks auth status before fetching preferences

This prevents 401 errors in server logs when visitors view the landing page.

### Shared Types (`src/components/feed/types.ts`)
Centralized type definitions including:
- `FeedItem` - Full bookmark data for display
- `StreamedBookmark` - Lighter type for sync SSE events
- `streamedBookmarkToFeedItem()` - Conversion helper

### Feed API Performance
The feed API (`/api/feed/route.ts`) uses optimized SQL queries to avoid N+1 problems:
- Single query fetches bookmarks with tags via SQL subquery
- Media and links fetched in bulk with `IN` clause
- Read status joined efficiently

```typescript
// Tags fetched via subquery (avoids N+1)
const tagsSubquery = db
  .select({
    bookmarkId: bookmarkTags.bookmarkId,
    tags: sql<string>`GROUP_CONCAT(${bookmarkTags.tag})`.as('tags'),
  })
  .from(bookmarkTags)
  .where(eq(bookmarkTags.userId, userId))
  .groupBy(bookmarkTags.bookmarkId)
  .as('tags_agg')
```

### Media Handling
FxTwitter (`api.fxtwitter.com`) provides reliable media URLs (Twitter has CORS issues).

- **Videos**: `/api/media/video?author=xxx&tweetId=xxx&quality=preview|hd|full`
- **Photos**: `https://d.fixupx.com/{author}/status/{tweetId}/photo/{index}`

**Video Quality Levels:**

| Quality | Resolution | Bitrate | Use Case |
|---------|------------|---------|----------|
| `preview` | 360p | ~832kbps | Gallery hover preview |
| `hd` | 720p | ~2Mbps | Focus mode playback, mobile download |
| `full` | 1080p | ~10Mbps | Desktop download only |

**Video Playback UX Patterns:**

| Context | Attributes | Behavior | Why |
|---------|------------|----------|-----|
| Gallery hover | `muted autoPlay loop playsInline` | Silent auto-preview | Quick browse without disruption |
| Focus mode | `controls playsInline` (no autoPlay) | Click to play with sound | Full viewing experience |

**Browser Autoplay Policy**: Modern browsers block autoplaying videos with sound. Gallery works because it's `muted`. Focus mode removes `autoPlay` so users click play and get sound immediately - this is intentional UX, not a workaround.

**HLS Streaming for Long Videos:**
Videos >5 minutes use HLS (HTTP Live Streaming) to avoid Fly.io's 60-second proxy timeout:
- `src/app/api/media/video/info/route.ts` - Determines playback strategy (MP4 vs HLS)
- `src/app/api/media/video/hls/route.ts` - Proxies m3u8 playlists, rewrites URLs
- `src/app/api/media/video/hls/segment/route.ts` - Proxies video/audio segments
- `src/components/feed/VideoPlayer.tsx` - Smart player with HLS.js for Chrome/Firefox

**Why HLS proxy?** Twitter's video CDN (`video.twimg.com`) returns 403 for direct browser requests. Our server proxies with proper `User-Agent` and `Referer` headers.

**Browser HLS Detection Gotcha:**
```typescript
// ❌ Wrong: Chrome on Mac returns truthy but can't play HLS natively
const canPlay = video.canPlayType('application/vnd.apple.mpegurl')

// ✅ Correct: Explicit Safari detection
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
const canPlayHlsNatively = isSafari && video.canPlayType('application/vnd.apple.mpegurl')
```

**Video Downloads:**
- Desktop: `/api/media/video/download` endpoint with `Content-Disposition: attachment` for instant browser download with progress bar
- Mobile: Limited to 50MB (HD quality check). Shows friendly "too thicc for your phone" message via `VideoDownloadBlocked` component when exceeded
- Size estimation: `duration × bitrate / 8` (returned by `/api/media/video/info`)

Key files:
- `src/lib/media/fxembed.ts` - FxTwitter API types and URL builders
- `src/app/api/media/video/route.ts` - Video proxy with quality selection
- `src/app/api/media/video/download/route.ts` - Streaming download endpoint
- `src/components/feed/VideoPlayer.tsx` - Smart video player (HLS/MP4 auto-selection)
- `src/components/feed/utils.tsx` - `VideoDownloadBlocked` shared component, `handleShareMedia`
- `src/components/feed/FeedCard.tsx` - Gallery video preview (muted autoplay)
- `src/components/feed/Lightbox.tsx` - Focus mode video (click to play with sound)

### Database (SQLite + Drizzle)

Database location: `./data/adhdone.db`

**Multi-user schema with composite primary keys:**

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `bookmarks` | `(userId, id)` | Main tweet data - same tweet can exist for multiple users |
| `bookmark_tags` | `(userId, bookmarkId, tag)` | Tags are per-user, not shared globally |
| `bookmark_media` | `(userId, id)` | Media attachments per user |
| `bookmark_links` | `id` (auto) + `userId` | URLs with enrichment data |
| `read_status` | `(userId, bookmarkId)` | Read/unread tracking per user |
| `user_preferences` | `(userId, key)` | User settings (theme, font, etc.) |
| `oauth_tokens` | `userId` | Twitter OAuth credentials |
| `sync_logs` | `id` + `userId` | Sync history per user |
| `collections` | `id` + `userId` | Custom bookmark collections |
| `tag_shares` | `(userId, tag)` | Public tag sharing settings |

**Why composite keys**: Allows User A and User B to both bookmark tweet X independently, with separate read status, tags, and preferences.

Schema modifications: Edit `src/lib/db/schema.ts`, then run `pnpm drizzle-kit push:sqlite`

## API Patterns

### Authenticated route
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... query with userId filter
  return NextResponse.json({ data })
}
```

### SSE streaming
```typescript
export async function GET() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      send('start', { message: 'Starting...' })
      send('complete', { stats })
      controller.close()
    }
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}
```

## Key API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/health` | GET | No | Health check for monitoring |
| `/api/feed` | GET | Yes | Main feed with filtering |
| `/api/bookmarks/[id]/read` | POST/DELETE | Yes | Toggle read status |
| `/api/bookmarks/[id]/tags` | POST/DELETE | Yes | Add/remove tags |
| `/api/sync` | GET | Yes | SSE sync stream |
| `/api/tweets/add` | POST | Yes | Add single tweet |
| `/api/tags` | GET | Yes | List user's tags with counts and share URLs |
| `/api/tags` | PATCH | Yes | Toggle tag public sharing (returns `shareUrl`) |
| `/api/tags` | DELETE | Yes | Delete tag from all bookmarks |
| `/api/share/tag/by-name/[username]/[tag]` | GET | No | View shared tag collection (friendly URL) |
| `/api/share/tag/by-name/[username]/[tag]/clone` | POST | Yes | Clone shared tag to user's account |
| `/api/share/tag/[code]` | GET | No | View shared tag (legacy random code) |
| `/api/share/tweet/[username]/[id]` | GET | No | Public tweet JSON API (LLM-friendly, 5-min cache) |
| `/api/auth/twitter` | GET | No | Start OAuth flow |
| `/api/auth/twitter/callback` | GET | No | OAuth callback |
| `/api/auth/twitter/status` | GET | No | Check auth status and refresh tokens |

## Environment Variables

```env
# Required
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional
SESSION_SECRET=           # For JWT signing (falls back to TWITTER_CLIENT_SECRET)
SENTRY_DSN=               # Sentry error tracking DSN
SENTRY_RELEASE=           # Set automatically in Docker builds
SENTRY_ENVIRONMENT=       # 'staging' or 'production' (set in fly.toml/fly.production.toml)
```

## CI/CD & Deployment

### Development Workflow (IMPORTANT)

**ALWAYS test locally before deploying:**
1. Make changes locally
2. Run `pnpm dev` and test the feature manually in the browser
3. Verify the feature works as expected with real user interaction
4. Run `pnpm test` and `pnpm typecheck` to ensure no regressions
5. Only after local verification, create a PR

**NEVER auto-deploy to production:**
- Production deploys should be explicit, intentional actions
- Always verify on staging first (adhx.fly.dev)
- Use Fly CLI for production: `fly deploy --config fly.production.toml --app adhx-prod`

**When debugging browser features:**
- Use browser DevTools to inspect network requests and console logs
- Add temporary `console.log` statements to trace execution flow
- Test with real data, not just API responses
- Remember that React state updates are batched - effects may not run immediately

### Deployment Environments

| Environment | App | URL | Config File | Volume |
|-------------|-----|-----|-------------|--------|
| Staging | `adhx` | adhx.fly.dev | `fly.toml` | `adhx_data` |
| Production | `adhx-prod` | adhx.com | `fly.production.toml` | `adhx_prod_data` |

**Deployment flow:**
1. Code merged to main → Release-please creates version bump PR
2. Version PR merged → **Auto-deploys to staging only**
3. Verify staging works → Manual deploy to production via Fly CLI

```bash
# Deploy to staging (default, also triggered by release-please)
gh workflow run deploy.yml

# Deploy to production (via Fly CLI - GitHub Actions token doesn't have prod access)
fly deploy --config fly.production.toml --app adhx-prod

# Check deployed versions
curl -s https://adhx.fly.dev/api/health | jq .version  # staging
curl -s https://adhx.com/api/health | jq .version      # production
```

### GitHub Actions Workflows
- **CI** (`.github/workflows/ci.yml`) - Runs on PRs: lint, typecheck, test, build
- **Deploy** (`.github/workflows/deploy.yml`) - Deploys to Fly.io with environment selection (staging/production)
- **Release Please** (`.github/workflows/release-please.yml`) - Automated semantic versioning, triggers staging deploy via `workflow_dispatch`

**Important**: GitHub doesn't fire `release: published` events when releases are created with `GITHUB_TOKEN` (security measure). The release-please workflow directly triggers deploy via `gh workflow run deploy.yml` instead.

### Sentry Release Tracking
Deployments automatically create Sentry releases for error tracking:
- Version from `package.json` is passed as `SENTRY_RELEASE` build arg
- Commits are associated with releases for "Suspect Commits" feature
- Deploy notifications sent to Sentry after successful deployment
- **Environment separation**: `SENTRY_ENVIRONMENT` env var tags errors as `staging` or `production`
- Same Sentry project, filter by environment in Sentry UI

### Fly.io Secrets
Required secrets on **both** Fly.io apps (set via `fly secrets set --app <app-name>`):
- `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` - Twitter OAuth
- `NEXT_PUBLIC_APP_URL` - `https://adhx.fly.dev` (staging) or `https://adhx.com` (production)
- `SENTRY_DSN` - Error tracking (same DSN for both, separated by `SENTRY_ENVIRONMENT`)
- `SESSION_SECRET` - JWT signing (generate unique per environment)

**Twitter OAuth**: Both callback URLs must be registered in Twitter Developer Portal:
- `https://adhx.fly.dev/api/auth/twitter/callback`
- `https://adhx.com/api/auth/twitter/callback`

### Fresh Database Deployment (Major Schema Changes)
For breaking schema changes (like switching to composite primary keys), deploy a fresh database:

```bash
# STAGING
fly machines list --app adhx
fly machines stop <machine-id> --app adhx
fly machines destroy <machine-id> --app adhx --force
fly volumes delete <volume-id> --app adhx --yes
fly volumes create adhx_data --region lhr --size 1 --app adhx
gh workflow run deploy.yml

# PRODUCTION
fly machines list --app adhx-prod
fly machines stop <machine-id> --app adhx-prod
fly machines destroy <machine-id> --app adhx-prod --force
fly volumes delete <volume-id> --app adhx-prod --yes
fly volumes create adhx_prod_data --region lhr --size 1 --app adhx-prod
gh workflow run deploy.yml -f environment=production
```

The app will initialize a fresh SQLite database with the new schema. Users will need to re-authenticate and sync their bookmarks.

## Testing

```bash
pnpm test         # Run all 719 tests (41 test files)
pnpm test:watch   # Watch mode
```

Test files in `src/__tests__/`:
- `session.test.ts` - JWT session handling
- `oauth.test.ts` - OAuth PKCE flow, state management, token exchange
- `types.test.ts` - Shared type conversions
- `feed-helpers.test.ts` - Feed utilities
- `format.test.ts` - Number formatting, relative time, text truncation
- `url-expander.test.ts` - URL expansion
- `fxembed.test.ts` - FxTwitter integration
- `twitter-client.test.ts` - Twitter API client, token refresh, bookmarks fetching
- `og-image-selection.test.ts` - OG image priority selection for social unfurling
- `og-metadata-fixtures.test.ts` - OG metadata generation with real tweet fixtures
- `article-text.test.ts` - Article block to markdown conversion
- `feed-utils.test.ts` - Feed utility functions
- `proxy.test.ts` - Media proxy URL validation
- `url-prefix-route.test.ts` - URL prefix route parameter validation
- `platform.test.ts` - Platform detection (iOS/Android/desktop, SSR safety)
- `share-page.test.ts` - PWA Share Target URL parsing and redirect logic
- `sitemap.test.ts` - Dynamic sitemap generation with public tags and deduplication
- `utils.test.ts` - General utilities

API route tests in `src/__tests__/api/`:
- `setup.ts` - In-memory SQLite test database factory
- `bookmarks-*.test.ts` - Bookmark CRUD operations
- `tags.test.ts` - Tag management
- `preferences.test.ts` - User preferences
- `feed.test.ts` - Feed filtering, pagination, tag queries
- `auth-callback.test.ts` - OAuth callback handling
- `auth-status.test.ts` - Auth status and token refresh
- `sync-cooldown.test.ts` - 15-minute sync rate limiting
- `tweets-add.test.ts` - Manual tweet adding, URL parsing, categorization
- `media-video.test.ts` - Video proxy, quality selection, range requests
- `media-video-download.test.ts` - Video download endpoint, range requests, mobile limits
- `media-video-info.test.ts` - Video info endpoint, HLS detection
- `account.test.ts` - Account management (clear data, delete)
- `share-tag-clone.test.ts` - Tag sharing and cloning functionality
- `share-tweet.test.ts` - Public tweet JSON API and adhxContext enrichment
- `stats.test.ts` - User stats endpoint

All API tests verify multi-user isolation (User A's actions don't affect User B).

**Test mock pattern for `@/lib/db`**: When a route imports new exports from `@/lib/db` (like `runInTransaction`), the test mock must be updated to include them. Tests use `createTestDb()` from `setup.ts` which exposes `{ db, sqlite, close }`:

```typescript
vi.mock('@/lib/db', () => ({
  get db() { return testInstance.db },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))
```

Forgetting to add new exports to mocks causes silent 500 errors in tests.

## Common Tasks

### Add UI component
1. Create in `src/components/`
2. Use `cn()` from `@/lib/utils` for class merging
3. Use lucide-react for icons
4. Export from barrel file if in a subdirectory

### Database queries (Drizzle)
```typescript
import { db } from '@/lib/db'
import { bookmarks } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

const results = await db
  .select()
  .from(bookmarks)
  .where(and(eq(bookmarks.userId, userId), eq(bookmarks.category, 'github')))
  .orderBy(desc(bookmarks.processedAt))
  .limit(20)
```
