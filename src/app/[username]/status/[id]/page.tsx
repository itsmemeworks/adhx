import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getSession } from '@/lib/auth/session'
import { QuickAddLanding } from '@/components/QuickAddLanding'
import { TweetPreviewLanding } from '@/components/TweetPreviewLanding'
import { fetchTweetData, type FxTwitterResponse } from '@/lib/media/fxembed'
import { truncate } from '@/lib/utils/format'
import { getOgImages } from '@/lib/utils/og-image'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

interface Props {
  params: Promise<{ username: string; id: string }>
}

// Fetch tweet data from FxTwitter API (cached per request via Next.js)
async function getTweetData(username: string, tweetId: string) {
  try {
    const data = await fetchTweetData(username, tweetId)
    return data?.tweet || null
  } catch (error) {
    console.error('Failed to fetch tweet preview:', error)
    return null
  }
}

/**
 * Build Schema.org JSON-LD structured data for a tweet.
 */
function buildJsonLd(tweet: FxTweet, baseUrl: string, username: string, id: string) {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    headline: tweet.article?.title || truncate(tweet.text || `Tweet by @${tweet.author.screen_name}`, 110),
    articleBody: tweet.text || undefined,
    author: {
      '@type': 'Person',
      name: tweet.author.name,
      url: `https://x.com/${tweet.author.screen_name}`,
      image: tweet.author.avatar_url,
    },
    datePublished: tweet.created_at,
    url: tweet.url || `https://x.com/${username}/status/${id}`,
    mainEntityOfPage: `${baseUrl}/${username}/status/${id}`,
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: tweet.likes,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/ShareAction',
        userInteractionCount: tweet.retweets,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: tweet.replies,
      },
    ],
  }

  // Add image
  const ogImages = getOgImages(tweet, baseUrl)
  if (ogImages[0] && !ogImages[0].url.endsWith('/og-logo.png')) {
    jsonLd.image = ogImages[0].url
  }

  // Add video
  if (tweet.media?.videos?.[0]) {
    const video = tweet.media.videos[0]
    jsonLd.video = {
      '@type': 'VideoObject',
      contentUrl: video.url,
      thumbnailUrl: video.thumbnail_url,
      width: video.width,
      height: video.height,
    }
  }

  return jsonLd
}

export default async function QuickAddPage({ params }: Props) {
  const { username, id } = await params

  // Validate username (Twitter handles are 1-15 alphanumeric + underscore)
  if (!/^\w{1,15}$/.test(username)) {
    redirect('/')
  }

  // Validate tweet ID (numeric only)
  if (!/^\d+$/.test(id)) {
    redirect('/')
  }

  // Fetch tweet data server-side for rich preview
  const tweet = await getTweetData(username, id)

  // Check authentication
  const session = await getSession()

  // Show rich preview if we have tweet data
  if (tweet) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const jsonLd = buildJsonLd(tweet, baseUrl, username, id)

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <TweetPreviewLanding username={username} tweetId={id} tweet={tweet} isAuthenticated={!!session} />
      </>
    )
  }

  // Fallback: Show minimal landing page if FxTwitter API failed
  return <QuickAddLanding username={username} tweetId={id} />
}

/**
 * Build a rich OG description with quote tweet and external link context.
 */
function buildDescription(tweet: FxTweet): string {
  const parts: string[] = []

  // Main tweet text
  const tweetText = tweet.text || tweet.article?.preview_text || tweet.article?.title || ''
  if (tweetText) parts.push(tweetText)

  // Quote tweet context
  if (tweet.quote?.text) {
    parts.push(`QT @${tweet.quote.author.screen_name}: "${truncate(tweet.quote.text, 120)}"`)
  }

  // External link title
  if (tweet.external?.title) {
    parts.push(`\u{1f517} ${tweet.external.title}`)
  }

  const joined = parts.join(' — ')
  return truncate(joined, 500)
}

// Generate dynamic metadata for social unfurling
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, id } = await params

  // Validate params early to avoid API calls for invalid URLs
  if (!/^\w{1,15}$/.test(username) || !/^\d+$/.test(id)) {
    return {
      title: 'ADHX - Save now. Read never. Find always.',
      description: 'For people who bookmark everything and read nothing.',
    }
  }

  // Fetch tweet data for rich metadata
  const tweet = await getTweetData(username, id)

  // Fallback metadata if tweet fetch fails
  if (!tweet) {
    return {
      title: `Save @${username}'s tweet - ADHX`,
      description: 'Save this tweet to your ADHX collection',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const canonicalUrl = `${baseUrl}/${username}/status/${id}`

  // Build dynamic metadata with tweet content
  const isArticle = !!tweet.article?.title
  const tweetText = tweet.text || ''
  const articleTitle = tweet.article?.title || ''

  const description = buildDescription(tweet)

  // Title: cleaner for articles, informative for regular tweets
  const title = isArticle
    ? `${articleTitle} - @${tweet.author.screen_name}`
    : `@${tweet.author.screen_name}: "${truncate(tweetText, 50)}" - Save to ADHX`

  // Select best OG images with real dimensions
  const ogImages = getOgImages(tweet, baseUrl)

  // OG title: for articles use article title directly
  const ogTitle = isArticle
    ? articleTitle
    : `@${tweet.author.screen_name} on X`

  // Build OG video tags for video tweets
  const ogVideos = tweet.media?.videos?.length
    ? tweet.media.videos.slice(0, 1).map((video) => ({
        url: video.url,
        width: video.width,
        height: video.height,
        type: 'video/mp4' as const,
      }))
    : undefined

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title: ogTitle,
      description,
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
      card: 'summary_large_image',
      title: isArticle ? articleTitle : `Save @${tweet.author.screen_name}'s tweet - ADHX`,
      description,
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
