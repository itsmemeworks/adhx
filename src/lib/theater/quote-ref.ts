import { proxiedPhotoSrc } from '@/lib/media/fxembed'
import type { TheaterQuoteRef } from '@/lib/trending/query'

const MAX_QUOTE_PHOTOS = 4

/** FxTwitter / share-API quote shapes we map from — keep this loose. */
export interface QuoteSource {
  id?: string | null
  text?: string | null
  author?: {
    screen_name?: string | null
    username?: string | null
    name?: string | null
    avatar_url?: string | null
    avatarUrl?: string | null
  } | null
  media?: {
    photos?: Array<{ url?: string | null }> | null
    videos?: Array<{ thumbnail_url?: string | null; thumbnailUrl?: string | null }> | null
  } | null
  article?: {
    cover_media?: { media_info?: { original_img_url?: string | null } } | null
    coverImageUrl?: string | null
  } | null
  external?: { thumbnail_url?: string | null; thumbnailUrl?: string | null } | null
}

/** Saved-bookmark `quoteContext` JSON (and the in-memory QuoteContext object). */
export interface StoredQuoteContext {
  tweetId?: string | null
  author?: string | null
  authorName?: string | null
  authorProfileImageUrl?: string | null
  text?: string | null
  media?: QuoteSource['media']
}

function handleOf(source: QuoteSource): string {
  return (source.author?.screen_name || source.author?.username || '').replace(/^@+/, '')
}

function photoUrlsFor(author: string, tweetId: string | null | undefined, count: number): string[] {
  if (!author || !tweetId || count <= 0) return []
  return Array.from({ length: Math.min(count, MAX_QUOTE_PHOTOS) }, (_, i) =>
    proxiedPhotoSrc(author, tweetId, i + 1),
  )
}

/**
 * Map a quoted tweet (FxTwitter `tweet.quote` or `/api/share/tweet` `quoteTweet`)
 * into the theater's public `TheaterQuoteRef`. Returns undefined when there's
 * nothing to show.
 */
export function quoteRefFromSource(
  source: QuoteSource | null | undefined,
): TheaterQuoteRef | undefined {
  if (!source) return undefined
  const author = handleOf(source)
  const text = (source.text || '').trim() || null
  if (!author && !text) return undefined

  const photoCount = source.media?.photos?.filter((p) => p?.url).length ?? 0
  const photoUrls = photoUrlsFor(author, source.id, photoCount)
  const videoThumb =
    source.media?.videos?.[0]?.thumbnail_url || source.media?.videos?.[0]?.thumbnailUrl || null
  const cover =
    source.article?.cover_media?.media_info?.original_img_url ||
    source.article?.coverImageUrl ||
    null
  const externalThumb = source.external?.thumbnail_url || source.external?.thumbnailUrl || null
  const thumbnailUrl = photoUrls[0] || videoThumb || cover || externalThumb || null
  const hasVideo = (source.media?.videos?.length ?? 0) > 0

  return {
    author,
    authorName: source.author?.name || null,
    text,
    authorAvatarUrl: source.author?.avatar_url || source.author?.avatarUrl || null,
    ...(source.id ? { bookmarkId: source.id } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(photoUrls.length > 0 ? { photoUrls } : {}),
    ...(hasVideo ? { hasVideo: true } : {}),
  }
}

/** Map a saved bookmark's `quoteContext` onto `TheaterQuoteRef`. */
export function quoteRefFromStoredContext(
  parsed: StoredQuoteContext | null | undefined,
): TheaterQuoteRef | undefined {
  if (!parsed) return undefined
  return quoteRefFromSource({
    id: parsed.tweetId,
    text: parsed.text,
    author: {
      screen_name: parsed.author,
      name: parsed.authorName,
      avatar_url: parsed.authorProfileImageUrl,
    },
    media: parsed.media,
  })
}
