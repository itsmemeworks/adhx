# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ADHX

**Save now. Read never. Find always.**

A Twitter/X bookmark manager for people who bookmark everything and read nothing. Built with Next.js 15.

## Quick Start

```bash
pnpm install
pnpm dev         # Start dev server at localhost:3000
pnpm build       # Production build
pnpm test        # Run tests (79 tests with vitest)
```

## Tech Stack

- **Framework**: Next.js 15.5 (App Router) + React 19
- **Database**: SQLite via better-sqlite3 + Drizzle ORM 0.45
- **Styling**: Tailwind CSS 3.4 + clsx + tailwind-merge
- **Twitter API**: twitter-api-v2 with OAuth 2.0 PKCE
- **Auth**: JWT-signed session cookies (jose)
- **Icons**: lucide-react
- **Fonts**: Indie Flower (brand), IBM Plex Sans/Inter/Lexend/Atkinson Hyperlegible (body - user selectable)
- **Testing**: Vitest

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

## Architecture

### URL Prefix Feature
Users can save tweets by visiting `adhx.com/{username}/status/{id}`:
- Route: `src/app/[username]/status/[id]/page.tsx`
- Authenticated: Adds tweet, redirects to `/?open={id}` (opens lightbox)
- Unauthenticated: Shows `QuickAddLanding` with login prompt

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

### Main Feed (`src/app/page.tsx`)
Client component with:
- **FeedGrid**: Masonry gallery with FeedCard components
- **Lightbox**: Full-screen modal with keyboard navigation (←→, R/U for read/unread, Esc)
- **FilterBar**: Category filters and search

### Shared Types (`src/components/feed/types.ts`)
Centralized type definitions including:
- `FeedItem` - Full bookmark data for display
- `StreamedBookmark` - Lighter type for sync SSE events
- `streamedBookmarkToFeedItem()` - Conversion helper

### Media Handling
FxTwitter (`api.fxtwitter.com`) provides reliable media URLs (Twitter has CORS issues).

- **Videos**: `/api/media/video?author=xxx&tweetId=xxx&quality=preview|hd|full`
- **Photos**: `https://d.fixupx.com/{author}/status/{tweetId}/photo/{index}`

Key files:
- `src/lib/media/fxembed.ts` - FxTwitter API types and URL builders
- `src/app/api/media/video/route.ts` - Video proxy with quality selection

### Database (SQLite + Drizzle)

Database location: `./data/adhdone.db`

Key tables:
- `bookmarks` - Main tweet data (includes `userId` for multi-user)
- `bookmark_links` - URLs with enrichment data
- `bookmark_media` - Media attachments
- `read_status` - Read/unread tracking
- `oauth_tokens` - Twitter OAuth credentials
- `sync_logs` - Sync history

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
| `/api/feed` | GET | Yes | Main feed with filtering |
| `/api/bookmarks/[id]/read` | POST/DELETE | Yes | Toggle read status |
| `/api/bookmarks/[id]/tags` | PUT | Yes | Update tags |
| `/api/sync` | GET | Yes | SSE sync stream |
| `/api/tweets/add` | POST | Yes | Add single tweet |
| `/api/auth/twitter` | GET | No | Start OAuth flow |
| `/api/auth/twitter/callback` | GET | No | OAuth callback |

## Environment Variables

```env
# Required
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional
SESSION_SECRET=           # For JWT signing (falls back to TWITTER_CLIENT_SECRET)
```

## Testing

```bash
pnpm test         # Run all 79 tests
pnpm test:watch   # Watch mode
```

Test files in `src/__tests__/`:
- `session.test.ts` - JWT session handling
- `types.test.ts` - Shared type conversions
- `feed-helpers.test.ts` - Feed utilities
- `url-expander.test.ts` - URL expansion
- `fxembed.test.ts` - FxTwitter integration
- `utils.test.ts` - General utilities

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
