'use client'

import { useEffect, useState } from 'react'
import { fetchShareTweet } from '@/lib/theater/share-tweet'
import { theaterItemKey, type TheaterItem } from './types'

export interface TwitterVideoAlbum {
  index: number
  setIndex: (index: number) => void
  count: number
  posters: string[]
}

/**
 * Twitter video albums (2–4 clips). Seeded from the item when the shared
 * preview / Saved mapper already knows the count; pulse rows hydrate from
 * `/api/share/tweet` the same way photos do.
 */
export function useTwitterVideoAlbum(item: TheaterItem | null): TwitterVideoAlbum {
  const key = item ? theaterItemKey(item) : ''
  const seedCount = Math.max(1, item?.videoCount ?? 1)
  const seedPosters = item?.videoPosters ?? []
  const [index, setIndex] = useState(0)
  const [count, setCount] = useState(seedCount)
  const [posters, setPosters] = useState<string[]>(seedPosters)

  useEffect(() => {
    setIndex(0)
    setCount(Math.max(1, item?.videoCount ?? 1))
    setPosters(item?.videoPosters ?? [])
    if (
      !item ||
      item.platform !== 'twitter' ||
      item.contentType !== 'video' ||
      !item.author ||
      !item.bookmarkId
    ) {
      return
    }
    if ((item.videoCount ?? 1) > 1) return

    let cancelled = false
    void fetchShareTweet(item.author, item.bookmarkId).then((data) => {
      const videos = data?.media?.videos?.filter((v) => v) ?? []
      if (cancelled || videos.length < 2) return
      setCount(videos.length)
      setPosters(
        videos.map((v) => v.thumbnailUrl).filter((url): url is string => typeof url === 'string'),
      )
    })
    return () => {
      cancelled = true
    }
  }, [key, item?.videoCount, item?.author, item?.bookmarkId, item?.contentType, item?.platform])

  return { index, setIndex, count, posters }
}
