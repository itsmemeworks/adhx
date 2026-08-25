/**
 * Upstream preview resolution that must NOT block the theater HTML.
 *
 * Preview pages paint a URL-stub lead + chrome immediately, then pass this
 * module's Promise into TheaterShell (client `use()`) and a Suspense SEO
 * sibling (JSON-LD + sr-only article). Crawlers still wait in
 * `generateMetadata`; humans should not wait on FxTwitter / a scrape / oEmbed.
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { fetchTweetData, extractUrlsFromFacets, type FxTwitterResponse } from '@/lib/media/fxembed'
import { fetchOgMetadata } from '@/lib/utils/og-fetch'
import { truncate } from '@/lib/utils/format'
import { getOgImages } from '@/lib/utils/og-image'
import { buildSocialMediaPostingLd, buildVideoObjectLd } from '@/lib/utils/structured-data'
import { quoteRefFromSource } from '@/lib/theater/quote-ref'
import { linkPreviewFromExternal } from '@/lib/theater/link-preview'
import {
  reelToTheaterItem,
  tiktokToTheaterItem,
  tweetToTheaterItem,
  youtubeToTheaterItem,
} from '@/lib/theater/shared-seed'
import { recordHumanPreview } from '@/lib/theater/record-human-preview'
import { getSavedPreviewDisplay } from '@/lib/theater/saved-preview'
import { previewPath, recordActivity } from '@/lib/activity/record'
import { isLikelyBot } from '@/lib/activity/bot'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import { fetchReelMetadata } from '@/lib/media/instafix'
import { resolveInstagramVideo } from '@/lib/media/mirrors'
import { fetchTikTokMetadata } from '@/lib/media/tnktok'
import { fetchYouTubeMetadata, youtubeEmbedUrl, youtubeThumbnail } from '@/lib/media/youtube'
import type { TextLinkRef } from '@/components/theater/types'
import type { SharedResolveResult } from '@/lib/theater/shared-resolve'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

/** In-request dedupe with `generateMetadata` so a crawler hits FxTwitter once. */
export const getCachedTweet = cache(async (username: string, tweetId: string) => {
  try {
    const data = await fetchTweetData(username, tweetId)
    return data?.tweet || null
  } catch (error) {
    console.error('Failed to fetch tweet preview:', error)
    return null
  }
})

export function buildTweetJsonLd(tweet: FxTweet, baseUrl: string, username: string, id: string) {
  const ogImages = getOgImages(tweet, baseUrl)
  const image =
    ogImages[0] && !ogImages[0].url.endsWith('/og-logo.png') ? ogImages[0].url : undefined
  const video = tweet.media?.videos?.[0]

  return buildSocialMediaPostingLd({
    headline:
      tweet.article?.title || truncate(tweet.text || `Tweet by @${tweet.author.screen_name}`, 110),
    text: tweet.text || undefined,
    author: {
      name: tweet.author.name,
      url: `https://x.com/${tweet.author.screen_name}`,
      image: tweet.author.avatar_url,
    },
    datePublished: tweet.created_at,
    url: tweet.url || `https://x.com/${username}/status/${id}`,
    mainEntityOfPage: `${baseUrl}/${username}/status/${id}`,
    likes: tweet.likes,
    reposts: tweet.retweets,
    replies: tweet.replies,
    image,
    video: video
      ? {
          contentUrl: video.url,
          thumbnailUrl: video.thumbnail_url,
          width: video.width,
          height: video.height,
        }
      : undefined,
  })
}

/** Richer OG/Twitter-card description (quote + off-site title). */
export function buildTweetOgDescription(tweet: FxTweet): string {
  const parts: string[] = []
  const tweetText = tweet.text || tweet.article?.preview_text || tweet.article?.title || ''
  if (tweetText) parts.push(tweetText)
  if (tweet.quote?.text) {
    parts.push(`QT @${tweet.quote.author.screen_name}: "${truncate(tweet.quote.text, 120)}"`)
  }
  if (tweet.external?.title) {
    parts.push(`\u{1f517} ${tweet.external.title}`)
  }
  return truncate(parts.join(' — '), 500)
}

async function enrichTweetExternal(tweet: FxTweet): Promise<void> {
  if (tweet.external || tweet.article) return
  const facetUrls = extractUrlsFromFacets(tweet)
  if (facetUrls.length === 0) return
  const og = await fetchOgMetadata(facetUrls[0].expanded_url)
  if (!og) return
  tweet.external = {
    url: facetUrls[0].url,
    display_url: facetUrls[0].domain,
    expanded_url: facetUrls[0].expanded_url,
    title: og.title,
    description: og.description,
    thumbnail_url: og.image,
  }
}

function tweetTextLinks(tweet: FxTweet): TextLinkRef[] {
  const rawTextLinks = tweet.urls?.length ? tweet.urls : extractUrlsFromFacets(tweet)
  const seenExpandedUrls = new Set<string>()
  const textLinks: TextLinkRef[] = []
  for (const link of rawTextLinks) {
    if (!link.expanded_url || seenExpandedUrls.has(link.expanded_url)) continue
    seenExpandedUrls.add(link.expanded_url)
    textLinks.push({ shortUrl: link.url, expandedUrl: link.expanded_url })
    if (textLinks.length >= 8) break
  }
  return textLinks
}

export async function resolveTweetShared(
  username: string,
  id: string,
): Promise<SharedResolveResult> {
  const tweet = await getCachedTweet(username, id)
  if (!tweet) return { ok: false }

  await enrichTweetExternal(tweet)

  const previewAuthor = tweet.author?.screen_name || username
  const articleCover = tweet.article?.cover_media?.media_info?.original_img_url || null
  const quote = quoteRefFromSource(tweet.quote)
  const linkPreview = linkPreviewFromExternal(tweet.external)
  const previewType = tweet.article?.title
    ? 'article'
    : tweet.media?.videos?.length
      ? 'video'
      : tweet.media?.photos?.length
        ? 'photo'
        : linkPreview
          ? 'article'
          : 'text'

  const previewThumbnailUrl =
    articleCover ||
    tweet.media?.all?.[0]?.thumbnail_url ||
    tweet.media?.all?.[0]?.url ||
    linkPreview?.imageUrl ||
    null

  const textLinks = tweetTextLinks(tweet)

  const ua = (await headers()).get('user-agent')
  if (!isLikelyBot(ua)) {
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: id,
      author: previewAuthor,
      authorName: tweet.author?.name || null,
      authorAvatarUrl: tweet.author?.avatar_url || null,
      text: tweet.article?.title || tweet.text || null,
      thumbnailUrl: previewThumbnailUrl,
      contentType: previewType,
      textLinks: textLinks.length > 0 ? textLinks : undefined,
      quote,
      url: previewPath('twitter', previewAuthor, id),
    })
    metrics.theaterOpened('shared')
    recordAnalytic({
      name: 'theater.open',
      platform: 'twitter',
      bookmarkId: id,
      surface: 'shared',
    })
  }

  const videos = tweet.media?.videos ?? []
  const photos = tweet.media?.photos ?? []
  const videoPosters = videos.map((v) => v.thumbnail_url).filter((url): url is string => !!url)
  const item = tweetToTheaterItem({
    id,
    author: previewAuthor,
    authorName: tweet.author?.name || null,
    authorAvatarUrl: tweet.author?.avatar_url || null,
    text: tweet.article?.title || tweet.text || null,
    thumbnailUrl: previewThumbnailUrl,
    contentType: previewType,
    createdAt: tweet.created_at,
    textLinks: textLinks.length > 0 ? textLinks : undefined,
    quote,
    linkPreview,
    ...(videos.length > 1 ? { videoCount: videos.length, videoPosters } : {}),
    ...(photos.length > 1 ? { photoCount: photos.length } : {}),
  })

  return {
    ok: true,
    item,
    jsonLd: buildTweetJsonLd(tweet, PUBLIC_BASE_URL, username, id),
    staticPost: {
      kind: 'tweet',
      username: previewAuthor,
      tweetId: id,
      authorName: tweet.author?.name,
      authorAvatarUrl: tweet.author?.avatar_url,
      createdAt: tweet.created_at,
      articleTitle: tweet.article?.title,
      text: tweet.text,
      replies: tweet.replies,
      retweets: tweet.retweets,
      likes: tweet.likes,
      views: tweet.views,
      sourceUrl: tweet.url || `https://x.com/${previewAuthor}/status/${id}`,
    },
    related: {
      platform: 'twitter',
      bookmarkId: id,
      authorHandle: previewAuthor,
      contentType: previewType,
    },
  }
}

export async function resolveReelShared(id: string): Promise<SharedResolveResult> {
  const saved = getSavedPreviewDisplay('instagram', id)
  const meta = saved ? null : await fetchReelMetadata(id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const caption = saved?.text || meta?.caption || null
  const description = saved ? null : meta?.description || null
  const hasImage = saved ? true : !!meta?.imageUrl
  const imageUrl = hasImage
    ? `/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
    : undefined
  const available = saved ? true : !!meta

  const ua = (await headers()).get('user-agent')
  const human = !isLikelyBot(ua)
  if (human) {
    void resolveInstagramVideo(id, { range: 'bytes=0-1' })
      .then((res) => res?.body?.cancel())
      .catch(() => {})
  }

  await recordHumanPreview(available && human, {
    platform: 'instagram',
    bookmarkId: id,
    author: author || 'instagram',
    authorName: authorName || author || null,
    text: caption || description || null,
    thumbnailUrl: imageUrl ?? null,
    url: previewPath('instagram', author || 'instagram', id),
  })

  const item = reelToTheaterItem({
    id,
    author: author || 'instagram',
    authorName: authorName || author || null,
    text: caption || description || null,
    thumbnailUrl: imageUrl ?? null,
  })

  const baseUrl = PUBLIC_BASE_URL
  const ldAuthorName = authorName || author
  return {
    ok: true,
    item,
    jsonLd: buildVideoObjectLd({
      name:
        caption || description || (authorName ? `${authorName} on Instagram` : 'Instagram Reel'),
      description: caption || description || undefined,
      thumbnailUrl: imageUrl ? `${baseUrl}${imageUrl}` : undefined,
      contentUrl: available
        ? `${baseUrl}/api/media/instagram/video?id=${encodeURIComponent(id)}`
        : undefined,
      author: ldAuthorName
        ? {
            name: ldAuthorName,
            url: author ? `https://www.instagram.com/${author}` : undefined,
          }
        : undefined,
    }),
    staticPost: {
      kind: 'instagram-reel',
      authorName: authorName || author,
      handle: author,
      text: caption || description,
      sourceUrl: `https://www.instagram.com/reel/${id}/`,
      label: 'Instagram post',
    },
    related: available
      ? {
          platform: 'instagram',
          bookmarkId: id,
          authorHandle: author || 'instagram',
          contentType: 'video',
        }
      : null,
  }
}

export async function resolveTikTokShared(
  handle: string,
  id: string,
): Promise<SharedResolveResult> {
  const saved = getSavedPreviewDisplay('tiktok', id)
  const meta = saved ? null : await fetchTikTokMetadata(handle, id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const description = saved?.text || meta?.description || null
  const hasVideo = saved ? true : !!meta?.videoUrl
  const available = saved ? true : !!meta

  await recordHumanPreview(available, {
    platform: 'tiktok',
    bookmarkId: id,
    author: author || handle,
    authorName: authorName,
    text: description || meta?.title || null,
    thumbnailUrl: null,
    url: previewPath('tiktok', author || handle, id),
  })

  const item = tiktokToTheaterItem({
    id,
    handle,
    author,
    authorName,
    text: description || meta?.title || null,
  })

  const baseUrl = PUBLIC_BASE_URL
  return {
    ok: true,
    item,
    jsonLd: buildVideoObjectLd({
      name: meta?.title || description || `@${handle} on TikTok`,
      description: description || undefined,
      thumbnailUrl: `${baseUrl}/api/media/tiktok/thumbnail?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(id)}`,
      contentUrl: hasVideo
        ? `${baseUrl}/api/media/tiktok/video?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(id)}`
        : undefined,
      author: {
        name: authorName || author || `@${handle}`,
        url: `https://www.tiktok.com/@${handle}`,
      },
    }),
    staticPost: {
      kind: 'tiktok-video',
      authorName,
      handle: `@${handle}`,
      text: description,
      sourceUrl: `https://www.tiktok.com/@${handle}/video/${id}`,
      label: 'TikTok video',
    },
    related: available
      ? {
          platform: 'tiktok',
          bookmarkId: id,
          authorHandle: author || handle,
          contentType: 'video',
        }
      : null,
  }
}

export async function resolveYouTubeShared(id: string): Promise<SharedResolveResult> {
  const saved = getSavedPreviewDisplay('youtube', id)
  const meta = saved ? null : await fetchYouTubeMetadata(id)

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const title = saved?.text || meta?.title || null
  const available = saved ? true : !!meta
  const previewAuthor = author?.replace(/^@/, '') || authorName || 'youtube'

  await recordHumanPreview(available, {
    platform: 'youtube',
    bookmarkId: id,
    author: previewAuthor,
    authorName: authorName,
    text: title,
    thumbnailUrl: youtubeThumbnail(id),
    url: previewPath('youtube', previewAuthor, id),
  })

  const item = youtubeToTheaterItem({
    id,
    author: previewAuthor,
    authorName,
    text: title,
  })

  const ldAuthorName = authorName || author
  return {
    ok: true,
    item,
    jsonLd: buildVideoObjectLd({
      name: title || 'YouTube Short',
      thumbnailUrl: youtubeThumbnail(id),
      embedUrl: youtubeEmbedUrl(id),
      author: ldAuthorName ? { name: ldAuthorName } : undefined,
    }),
    staticPost: {
      kind: 'youtube-short',
      authorName,
      handle: author,
      text: title,
      sourceUrl: `https://www.youtube.com/shorts/${id}`,
      label: 'YouTube Short',
    },
    related: available
      ? {
          platform: 'youtube',
          bookmarkId: id,
          authorHandle: previewAuthor,
          contentType: 'video',
        }
      : null,
  }
}
