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
  instagramToTheaterItem,
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
import { getInstagramMetadataStatus } from '@/lib/media/instafix'
import { resolveInstagramVideo } from '@/lib/media/mirrors'
import { getTikTokMetadataStatus } from '@/lib/media/tnktok'
import { getYouTubeMetadataStatus, youtubeEmbedUrl, youtubeThumbnail } from '@/lib/media/youtube'
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
    seoEligible: true,
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

export async function resolveInstagramShared(
  id: string,
  pathHint: 'post' | 'reel' = 'reel',
): Promise<SharedResolveResult> {
  const saved = getSavedPreviewDisplay('instagram', id)
  // Saved rows already preserve the resolved type and carousel length. Their
  // images are re-resolved lazily by the thumbnail proxy, so avoid an upstream
  // page fetch on every shared-preview open when a durable row exists.
  const metadataStatus = saved ? null : await getInstagramMetadataStatus(id, pathHint)
  const meta = metadataStatus?.kind === 'resolved' ? metadataStatus.metadata : null

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const caption = saved?.text || meta?.caption || null
  const description = meta?.description || null
  const contentType =
    meta?.contentType ||
    (saved?.category === 'photo' ? 'photo' : saved?.category === 'video' ? 'video' : null) ||
    (pathHint === 'post' ? 'photo' : 'video')
  const photoCount = contentType === 'photo' ? meta?.media?.length || saved?.mediaCount || 1 : 0
  const hasImage = Boolean(meta?.imageUrl || saved?.mediaCount)
  const imageUrl = hasImage
    ? `/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
    : undefined
  const seoEligible = Boolean(saved || meta)

  const ua = (await headers()).get('user-agent')
  const human = !isLikelyBot(ua)
  if (human && contentType === 'video') {
    void resolveInstagramVideo(id, { range: 'bytes=0-1' })
      .then((res) => res?.body?.cancel())
      .catch(() => {})
  }

  await recordHumanPreview(seoEligible && human, {
    platform: 'instagram',
    bookmarkId: id,
    author: author || 'instagram',
    authorName: authorName || author || null,
    text: caption || description || null,
    thumbnailUrl: imageUrl ?? null,
    contentType,
    url: previewPath('instagram', author || 'instagram', id, contentType),
  })

  const item = instagramToTheaterItem({
    id,
    author: author || 'instagram',
    authorName: authorName || author || null,
    text: caption || description || null,
    thumbnailUrl: imageUrl ?? null,
    contentType,
    photoCount,
  })

  if (!seoEligible) {
    return { ok: true, item, seoEligible: false, related: null }
  }

  const baseUrl = PUBLIC_BASE_URL
  const ldAuthorName = authorName || author
  const authorHandle = author?.replace(/^@/, '')
  const sourcePath = contentType === 'photo' ? 'p' : 'reel'
  const sourcePostUrl = `https://www.instagram.com/${sourcePath}/${id}/`
  const previewUrl = `${baseUrl}/${contentType === 'photo' ? 'p' : 'reels'}/${id}`
  const photoImages =
    contentType === 'photo' && photoCount > 1
      ? Array.from(
          { length: photoCount },
          (_, index) =>
            `${baseUrl}/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}&index=${index + 1}`,
        )
      : imageUrl
        ? [`${baseUrl}${imageUrl}`]
        : []
  return {
    ok: true,
    item,
    seoEligible: true,
    jsonLd:
      contentType === 'video'
        ? buildVideoObjectLd({
            name:
              caption ||
              description ||
              (authorName ? `${authorName} on Instagram` : 'Instagram Reel'),
            description: caption || description || undefined,
            thumbnailUrl: imageUrl ? `${baseUrl}${imageUrl}` : undefined,
            contentUrl: `${baseUrl}/api/media/instagram/video?id=${encodeURIComponent(id)}`,
            author: ldAuthorName
              ? {
                  name: ldAuthorName,
                  url: authorHandle
                    ? `https://www.instagram.com/${encodeURIComponent(authorHandle)}/`
                    : undefined,
                }
              : undefined,
          })
        : buildSocialMediaPostingLd({
            headline: truncate(
              caption ||
                description ||
                (authorName ? `${authorName} on Instagram` : 'Instagram photo'),
              110,
            ),
            text: caption || description || undefined,
            author: {
              name: ldAuthorName || 'Instagram',
              url: authorHandle
                ? `https://www.instagram.com/${encodeURIComponent(authorHandle)}/`
                : undefined,
            },
            datePublished: meta?.takenAt,
            url: sourcePostUrl,
            mainEntityOfPage: previewUrl,
            image:
              photoImages.length > 1
                ? photoImages
                : photoImages.length === 1
                  ? photoImages[0]
                  : undefined,
          }),
    staticPost: {
      kind: contentType === 'video' ? 'instagram-reel' : 'instagram-post',
      authorName: authorName || author,
      handle: author,
      text: caption || description,
      sourceUrl: sourcePostUrl,
      label: contentType === 'video' ? 'Instagram Reel' : 'Instagram post',
    },
    related: {
      platform: 'instagram',
      bookmarkId: id,
      authorHandle: author || 'instagram',
      contentType,
    },
  }
}

/** Reel-route compatibility wrapper. */
export async function resolveReelShared(id: string): Promise<SharedResolveResult> {
  return resolveInstagramShared(id, 'reel')
}

export async function resolveTikTokShared(
  handle: string,
  id: string,
): Promise<SharedResolveResult> {
  const saved = getSavedPreviewDisplay('tiktok', id)
  const metadataStatus = saved ? null : await getTikTokMetadataStatus(handle, id)
  const meta = metadataStatus?.kind === 'resolved' ? metadataStatus.metadata : null

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const description = saved?.text || meta?.description || null
  const hasVideo = saved ? true : !!meta?.videoUrl
  const seoEligible = Boolean(saved || meta)

  await recordHumanPreview(seoEligible, {
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

  if (!seoEligible) {
    return { ok: true, item, seoEligible: false, related: null }
  }

  const baseUrl = PUBLIC_BASE_URL
  return {
    ok: true,
    item,
    seoEligible: true,
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
    related: {
      platform: 'tiktok',
      bookmarkId: id,
      authorHandle: author || handle,
      contentType: 'video',
    },
  }
}

export async function resolveYouTubeShared(id: string): Promise<SharedResolveResult> {
  const saved = getSavedPreviewDisplay('youtube', id)
  const metadataStatus = saved ? null : await getYouTubeMetadataStatus(id)
  const meta = metadataStatus?.kind === 'resolved' ? metadataStatus.metadata : null

  const author = saved?.author || meta?.author || null
  const authorName = saved?.authorName || meta?.authorName || null
  const title = saved?.text || meta?.title || null
  const seoEligible = Boolean(saved || meta)
  const previewAuthor = author?.replace(/^@/, '') || authorName || 'youtube'

  await recordHumanPreview(seoEligible, {
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

  if (!seoEligible) {
    return { ok: true, item, seoEligible: false, related: null }
  }

  const ldAuthorName = authorName || author
  return {
    ok: true,
    item,
    seoEligible: true,
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
    related: {
      platform: 'youtube',
      bookmarkId: id,
      authorHandle: previewAuthor,
      contentType: 'video',
    },
  }
}
