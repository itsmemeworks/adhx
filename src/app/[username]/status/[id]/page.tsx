import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getCurrentUserId } from '@/lib/auth/session'
import { getOgImages } from '@/lib/utils/og-image'
import {
  buildTweetTitle,
  buildTweetSeoDescription,
  buildTweetOgDescription,
} from '@/lib/utils/tweet-metadata'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { buildSharedSeed, stubTweetTheaterItem } from '@/lib/theater/shared-seed'
import { getCachedTweet, resolveTweetShared } from '@/lib/theater/resolve-shared-preview'
import { SharedPreviewPage, MODERATED_PAGE_METADATA } from '@/lib/theater/shared-preview'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import { readPostModeration } from '@/lib/admin/moderation'

interface Props {
  params: Promise<{ username: string; id: string }>
}

export default async function QuickAddPage({ params }: Props) {
  const { username, id } = await params

  if (!/^\w{1,15}$/.test(username)) {
    redirect('/')
  }

  if (!/^\d+$/.test(id)) {
    redirect('/')
  }

  const moderation = readPostModeration('twitter', id)
  const unavailable = !moderation.ok || moderation.value
  const userId = unavailable ? null : await getCurrentUserId()
  const stub = stubTweetTheaterItem(username, id)
  const { seed } = await buildSharedSeed(stub)

  if (unavailable) {
    return (
      <TheaterShell
        seed={seed}
        mode="shared"
        sharedItem={stub}
        sharedUnavailable
        sharedUnavailableReason="hidden"
        authed={!!userId}
      />
    )
  }

  // Do not await FxTwitter / OG here — chrome paints on the stub, then
  // `sharedResolve` swaps in the real post (or StageUnavailable).
  return (
    <SharedPreviewPage
      seed={seed}
      sharedItem={stub}
      authed={!!userId}
      sharedResolve={resolveTweetShared(username, id)}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, id } = await params

  if (!/^\w{1,15}$/.test(username) || !/^\d+$/.test(id)) {
    return {
      title: 'ADHX - Save it. Lose it. Find it.',
      description: 'For people who bookmark everything and read nothing.',
    }
  }

  const moderation = readPostModeration('twitter', id)
  if (!moderation.ok || moderation.value) return MODERATED_PAGE_METADATA

  const tweet = await getCachedTweet(username, id)

  if (!tweet) {
    return {
      title: 'Post unavailable - ADHX',
      description: 'This post is no longer available on X.',
      robots: { index: false },
    }
  }

  const baseUrl = PUBLIC_BASE_URL
  const canonicalUrl = `${baseUrl}/${username}/status/${id}`

  const title = buildTweetTitle(tweet, tweet.author.screen_name)
  const description = buildTweetSeoDescription(tweet, tweet.author.screen_name, title)
  const ogDescription = buildTweetOgDescription(tweet, tweet.author.screen_name, title)
  const ogImages = getOgImages(tweet, baseUrl)
  const ogTitle = title

  const firstVideo = tweet.media?.videos?.[0]
  const ogVideos = firstVideo
    ? [
        {
          url: `${baseUrl}/api/media/video?author=${encodeURIComponent(username)}&tweetId=${encodeURIComponent(id)}&quality=hd`,
          width: firstVideo.width,
          height: firstVideo.height,
          type: 'video/mp4' as const,
        },
      ]
    : undefined

  const hasRichMedia = !!(
    tweet.media?.photos?.length ||
    tweet.media?.videos?.length ||
    tweet.article?.cover_media?.media_info?.original_img_url ||
    tweet.quote?.media?.photos?.[0]?.url ||
    tweet.quote?.media?.videos?.[0]?.thumbnail_url ||
    tweet.external?.thumbnail_url
  )

  return {
    title,
    description,
    openGraph: {
      type: ogVideos ? 'video.other' : 'article',
      title: ogTitle,
      description: ogDescription,
      siteName: 'ADHX',
      url: canonicalUrl,
      authors: [`https://x.com/${tweet.author.screen_name}`],
      publishedTime: tweet.created_at,
      images: ogImages.map((img) => ({
        url: img.url,
        ...(img.width && img.height ? { width: img.width, height: img.height } : {}),
        alt: `Tweet by @${tweet.author.screen_name}`,
      })),
      videos: ogVideos,
    },
    twitter: {
      card: hasRichMedia ? 'summary_large_image' : 'summary',
      title: ogTitle,
      description: ogDescription,
      images: [ogImages[0].url],
      creator: `@${tweet.author.screen_name}`,
    },
    alternates: {
      canonical: canonicalUrl,
      types: {
        'application/json': `${baseUrl}/api/share/tweet/${username}/${id}`,
      },
    },
  }
}
