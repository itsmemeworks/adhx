'use client'

import { useEffect, useState } from 'react'
import { proxiedPhotoSrc } from '@/lib/media/fxembed'
import { quoteRefFromSource } from '@/lib/theater/quote-ref'
import { fetchShareTweet } from '@/lib/theater/share-tweet'
import type { TheaterItem, TheaterQuoteRef } from './types'

/**
 * Fills in the quoted tweet (full text + photos) and the parent tweet's
 * photos from `/api/share/tweet`. Seed/pulse rows are often truncated or
 * text-only; the stage always wants the complete post.
 */
export function useHydratedQuote(item: TheaterItem): {
  quote: TheaterQuoteRef | undefined
  parentPhotos: string[]
  parentVideo: { author: string; bookmarkId: string; poster: string | null } | null
} {
  const [quote, setQuote] = useState<TheaterQuoteRef | undefined>(item.quote)
  const [parentPhotos, setParentPhotos] = useState<string[]>(seedParentPhotos(item))
  const [parentVideo, setParentVideo] = useState(parentVideoOf(item))

  useEffect(() => {
    setQuote(item.quote)
    setParentPhotos(seedParentPhotos(item))
    setParentVideo(parentVideoOf(item))
    if (item.platform !== 'twitter' || !item.author || !item.bookmarkId) return

    let cancelled = false
    const author = item.author
    const id = item.bookmarkId
    void fetchShareTweet(author, id).then((data) => {
      if (cancelled || !data) return
      const next = data.quoteTweet
        ? quoteRefFromSource({
            id: data.quoteTweet.id,
            text: data.quoteTweet.text,
            author: {
              username: data.quoteTweet.author?.username,
              name: data.quoteTweet.author?.name,
              avatarUrl: data.quoteTweet.author?.avatarUrl,
            },
            media: data.quoteTweet.media,
          })
        : undefined
      if (next) {
        setQuote({
          ...next,
          photoUrls: next.photoUrls?.length ? next.photoUrls : item.quote?.photoUrls,
          thumbnailUrl: next.thumbnailUrl || item.quote?.thumbnailUrl || null,
          hasVideo: next.hasVideo || item.quote?.hasVideo,
        })
      }
      const count = data.media?.photos?.filter((p) => p?.url).length ?? 0
      if (count > 0) {
        setParentPhotos(Array.from({ length: count }, (_, i) => proxiedPhotoSrc(author, id, i + 1)))
      }
      if (data.media?.videos?.length) {
        setParentVideo({
          author,
          bookmarkId: id,
          poster: data.media.videos[0]?.thumbnailUrl || item.thumbnailUrl || null,
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [
    item.platform,
    item.author,
    item.bookmarkId,
    item.quote?.bookmarkId,
    item.quote?.text,
    item.photoCount,
    item.thumbnailUrl,
  ])

  return { quote, parentPhotos, parentVideo }
}

/**
 * Seed photos from the item itself (before `/api/share/tweet` hydrates).
 * Off-site OG images live on `linkPreview`, not as tweet photos — treating
 * them as photos duplicated the card cover on the stage.
 */
export function seedParentPhotos(item: TheaterItem): string[] {
  const albumCount = item.photoCount && item.photoCount > 1 ? item.photoCount : 0
  // OG cover lives on the link card. Don't also render it as a tweet photo
  // (the proxy 404s, then fallbackToOriginal paints the same Substack image).
  if (item.linkPreview && item.contentType !== 'photo' && !albumCount) return []
  if (item.platform === 'twitter' && item.author && item.bookmarkId) {
    const author = item.author
    const id = item.bookmarkId
    if (albumCount) {
      return Array.from({ length: albumCount }, (_, i) => proxiedPhotoSrc(author, id, i + 1))
    }
    if (item.contentType === 'video') return []
    if (item.thumbnailUrl) return [proxiedPhotoSrc(author, id, 1)]
    return []
  }
  if (item.platform === 'instagram' && item.bookmarkId) {
    if (albumCount) {
      return Array.from(
        { length: albumCount },
        (_, i) =>
          `/api/media/instagram/thumbnail?id=${encodeURIComponent(item.bookmarkId || '')}&index=${i + 1}`,
      )
    }
    if (item.contentType === 'photo') {
      return [`/api/media/instagram/thumbnail?id=${encodeURIComponent(item.bookmarkId)}&index=1`]
    }
    return []
  }
  if (item.contentType === 'video') return []
  return item.thumbnailUrl ? [item.thumbnailUrl] : []
}

function parentVideoOf(
  item: TheaterItem,
): { author: string; bookmarkId: string; poster: string | null } | null {
  if (item.platform !== 'twitter' || !item.author || !item.bookmarkId) return null
  if (item.contentType !== 'video') return null
  return { author: item.author, bookmarkId: item.bookmarkId, poster: item.thumbnailUrl ?? null }
}
