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
pnpm test        # Run all 619 tests
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
- Restricts script sources to self and trusted CDNs
- Prevents clickjacking with `frame-ancestors 'self'`
- Blocks mixed content
- Configured for Twitter/X embed compatibility

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
Error tracking and user behavior metrics via Sentry SDK 10.x.

**Key file**: `src/lib/sentry.ts`

```typescript
import { captureException, metrics } from '@/lib/sentry'

// Capture errors with context
captureException(error, { userId, endpoint: '/api/sync' })

// Track user behavior
metrics.authCompleted(isNewUser)
metrics.syncCompleted(bookmarksCount, pagesCount, durationMs)
metrics.bookmarkReadToggled(true)
metrics.feedSearched(hasResults, resultCount)
metrics.trackUser(userId)
```

**Available metrics**:
- `auth.*` - OAuth flow tracking (started, completed, failed)
- `sync.*` - Sync operations (started, completed, failed, duration)
- `bookmark.*` - User interactions (read_toggled, tagged, added, deleted)
- `feed.*` - Feed usage (loaded, searched, filtered)
- `users.daily_active` - DAU tracking

## Architecture

### URL Prefix Feature
Users can save tweets by visiting `adhx.com/{username}/status/{id}`:
- Route: `src/app/[username]/status/[id]/page.tsx`
- Authenticated: Adds tweet, redirects to `/?open={id}` (opens lightbox)
- Unauthenticated: Shows `TweetPreviewLanding` with rich preview or `QuickAddLanding` as fallback

**OG Image Selection** (`getOgImage()` in page.tsx):
When generating Open Graph metadata for social unfurling, images are selected in priority order:
1. Direct media (tweet's own photos/video thumbnails)
2. Article cover image (X Articles `tweet.article.cover_media.media_info.original_img_url`)
3. Quote tweet media (when parent has no media, use quoted tweet's photos/videos)
4. External link thumbnail (`tweet.external.thumbnail_url`)
5. Fallback to `/logo.png` for text-only tweets

### iOS Shortcut Integration
iOS users can share tweets via the native share sheet using an iOS Shortcut that transforms X/Twitter URLs to ADHX preview URLs.

**Shortcut ID:** `b5f2a1999b734572961bdf2b063fce65`
**iCloud URL:** `https://www.icloud.com/shortcuts/b5f2a1999b734572961bdf2b063fce65`

**User flow:**
1. User views tweet in Safari/X app
2. Taps Share → selects "ADHX Preview" shortcut
3. Shortcut transforms `x.com/user/status/123` → `adhx.com/user/status/123`
4. Opens ADHX preview with full tweet content and media (no login walls)

**Implementation:**
- `src/components/feed/utils.tsx` - `isIOSDevice()` detects iOS (handles iPadOS 13+ edge case)
- `src/components/LandingPage.tsx` - `IOSShortcutPromo` component (shown only on iOS)
- `src/app/settings/SettingsClient.tsx` - `IOSShortcutCard` component (shown only on iOS)

**iOS Detection Pattern:**
```typescript
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  // iPadOS 13+ reports as MacIntel but has touch
  return /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
```

Components use `useState(false)` + `useEffect` pattern to detect iOS client-side, preventing SSR hydration mismatches.

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

Key files:
- `src/lib/media/fxembed.ts` - FxTwitter API types and URL builders
- `src/app/api/media/video/route.ts` - Video proxy with quality selection

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
```

## CI/CD & Deployment

### GitHub Actions Workflows
- **CI** (`.github/workflows/ci.yml`) - Runs on PRs: lint, typecheck, test, build
- **Deploy** (`.github/workflows/deploy.yml`) - Deploys to Fly.io (triggered by release-please or manual dispatch)
- **Release Please** (`.github/workflows/release-please.yml`) - Automated semantic versioning, triggers deploy via `workflow_dispatch`

**Important**: GitHub doesn't fire `release: published` events when releases are created with `GITHUB_TOKEN` (security measure). The release-please workflow directly triggers deploy via `gh workflow run deploy.yml` instead.

### Sentry Release Tracking
Deployments automatically create Sentry releases for error tracking:
- Version from `package.json` is passed as `SENTRY_RELEASE` build arg
- Commits are associated with releases for "Suspect Commits" feature
- Deploy notifications sent to Sentry after successful deployment

### Fly.io Secrets
Required secrets on Fly.io (set via `fly secrets set`):
- `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` - Twitter OAuth
- `SENTRY_DSN` - Error tracking
- `SESSION_SECRET` - JWT signing (optional)

### Fresh Database Deployment (Major Schema Changes)
For breaking schema changes (like switching to composite primary keys), deploy a fresh database:

```bash
# Stop and destroy the machine
fly machines list --app adhx
fly machines stop <machine-id> --app adhx
fly machines destroy <machine-id> --app adhx --force

# Delete and recreate the volume
fly volumes delete <volume-id> --app adhx --yes
fly volumes create adhx_data --region lhr --size 1 --app adhx

# Trigger deploy (creates new machine with fresh DB)
gh workflow run deploy.yml
```

The app will initialize a fresh SQLite database with the new schema. Users will need to re-authenticate and sync their bookmarks.

## Testing

```bash
pnpm test         # Run all 619 tests
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
- `share-tag-clone.test.ts` - Tag sharing and cloning functionality

All API tests verify multi-user isolation (User A's actions don't affect User B).

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
