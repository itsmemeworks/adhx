import { NextRequest, NextResponse } from 'next/server'
import { accessKeyUser } from '@/lib/auth/access-keys'
import { handleRouteError } from '@/lib/api/response'
import { checkRateLimit } from '@/lib/rate-limit'
import { findPosts } from '@/lib/semantic/find'
import type { SearchItem } from '@/lib/semantic/items'
import type { SearchType } from '@/lib/semantic/search'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { appUrl } from '@/lib/routes/app-url'

const MAX_QUERY = 200
const TYPES: readonly SearchType[] = ['all', 'videos', 'photos', 'text', 'articles']
const LIMIT = { windowMs: 60_000, max: 60 }
const REFINE_LIMIT = { windowMs: 60_000, max: 30 }

function json(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

const absolute = (url: string | null | undefined) =>
  !url ? null : url.startsWith('/') ? `${appUrl()}${url}` : url

/** One result, in the shape an assistant reads: what it is, where it lives, why it matched. */
function toResult({ post, matched, strength, learning }: SearchItem) {
  const kind =
    post.category === 'article' || post.isXArticle
      ? 'article'
      : post.media?.some((m) => m.mediaType === 'video' || m.mediaType === 'animated_gif')
        ? 'video'
        : post.media?.length
          ? 'photo'
          : 'text'
  return {
    platform: post.platform,
    kind,
    url: sourceUrl(post.platform, post.author, post.id, post.category) ?? post.tweetUrl,
    adhxUrl: `${appUrl()}${previewPath(post.platform, post.author, post.id, post.category)}`,
    author: { handle: post.author, name: post.authorName },
    text: post.text,
    postedAt: post.createdAt,
    savedAt: post.processedAt,
    article: post.articlePreview
      ? {
          title: post.articlePreview.title,
          description: post.articlePreview.description,
          url: post.articlePreview.url,
        }
      : null,
    links: (post.links ?? [])
      .map((l) => l.expandedUrl)
      .filter((u): u is string => !!u && !/^https?:\/\/(x|twitter)\.com\//.test(u)),
    media: (post.media ?? []).map((m) => ({
      type: m.mediaType,
      url: absolute(m.url),
      thumbnailUrl: absolute(m.thumbnailUrl),
      durationSeconds: m.durationMs ? Math.round(m.durationMs / 1000) : null,
    })),
    tags: post.tags,
    match: {
      strength,
      on: matched,
      ...(learning
        ? { note: 'Its picture or video is not understood yet; matched on words.' }
        : {}),
    },
  }
}

/**
 * GET /api/agent/search — search your own saves by meaning with an access key
 * (`Authorization: Bearer adhx_…`, made in Settings). For the adhx skill.
 *
 * - `q`: what to look for, in plain words ("a frog", "someone explaining
 *   transformers on a whiteboard"). Pictures and video frames are matched as
 *   well as words.
 * - `type`: `all` (default), `videos`, `photos`, `text`, `articles`.
 * - `limit`: 1–30, default 10. `offset` for the next page.
 *
 * Only ever the key owner's own saves; read-only.
 */
export async function GET(request: NextRequest) {
  const userId = await accessKeyUser(request.headers.get('authorization'))
  if (!userId) {
    return json(
      { error: 'Missing or unknown access key. Make one in ADHX Settings → Search from Claude.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
    )
  }
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY)
  const type = (params.get('type') ?? 'all') as SearchType
  if (!q) return json({ error: 'Say what to look for with ?q=' }, { status: 400 })
  if (!TYPES.includes(type)) {
    return json({ error: `type must be one of ${TYPES.join(', ')}` }, { status: 400 })
  }
  const limit = Math.min(30, Math.max(1, Number.parseInt(params.get('limit') ?? '10', 10) || 10))
  const offset = Math.min(200, Math.max(0, Number.parseInt(params.get('offset') ?? '0', 10) || 0))

  const limited = checkRateLimit(`agent-search:${userId}`, LIMIT)
  if (limited.limited) {
    return json(
      { error: 'Too many searches. Wait a minute.' },
      { status: 429, headers: { 'Retry-After': Math.ceil(limited.resetMs / 1000).toString() } },
    )
  }
  const refine = offset === 0 && !checkRateLimit(`search-refine:${userId}`, REFINE_LIMIT).limited

  try {
    const result = await findPosts({
      q,
      scope: 'mine',
      type,
      wordsOnly: false,
      userId,
      limit,
      offset,
      refine,
    })
    return json({
      query: q,
      type,
      results: result.items.map(toResult),
      total: result.total,
      nextOffset: result.nextOffset,
      ...(result.understood
        ? {}
        : { note: 'Search by meaning is warming up, so these matched on exact words only.' }),
      ...(result.items.length > 0 && !result.close
        ? { closest: 'Nothing matched closely; these are the nearest saves.' }
        : {}),
    })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/agent/search',
      userId,
      message: 'Search failed',
    })
  }
}
