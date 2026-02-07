import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getSession } from '@/lib/auth/session'
import { QuickAddLanding } from '@/components/QuickAddLanding'
import { TweetPreviewLanding } from '@/components/TweetPreviewLanding'
import { fetchTweetData, type FxTwitterResponse } from '@/lib/media/fxembed'
import { truncate, formatCount } from '@/lib/utils/format'
import { getOgImage } from '@/lib/utils/og-image'

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
  const ogImage = getOgImage(tweet, baseUrl)
  if (ogImage && !ogImage.endsWith('/og-logo.png')) {
    jsonLd.image = ogImage
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

  // Build dynamic metadata with tweet content
  const isArticle = !!tweet.article?.title
  const tweetText = tweet.text || ''
  const articleTitle = tweet.article?.title || ''
  const articlePreview = tweet.article?.preview_text || ''

  // Choose best text source
  const displayText = tweetText || articlePreview || articleTitle

  // Build engagement suffix for social proof in unfurls
  const engagementParts: string[] = []
  if (tweet.likes >= 100) engagementParts.push(`${formatCount(tweet.likes)} likes`)
  if (tweet.retweets >= 50) engagementParts.push(`${formatCount(tweet.retweets)} reposts`)
  const engagementSuffix = engagementParts.length > 0 ? ` (${engagementParts.join(', ')})` : ''

  // Expand description to 280 chars (full tweet length) + engagement
  const maxDescLen = 280 - engagementSuffix.length
  const description = truncate(displayText, maxDescLen) + engagementSuffix

  // Title: cleaner for articles, informative for regular tweets
  const title = isArticle
    ? `${articleTitle} - @${tweet.author.screen_name}`
    : `@${tweet.author.screen_name}: "${truncate(tweetText, 50)}" - Save to ADHX`

  // Select best OG image
  const ogImage = getOgImage(tweet, baseUrl)

  // OG title: for articles use article title directly
  const ogTitle = isArticle
    ? articleTitle
    : `@${tweet.author.screen_name} on X`

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title: ogTitle,
      description,
      siteName: 'ADHX',
      authors: [`https://x.com/${tweet.author.screen_name}`],
      publishedTime: tweet.created_at,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `Tweet by @${tweet.author.screen_name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: isArticle ? articleTitle : `Save @${tweet.author.screen_name}'s tweet - ADHX`,
      description,
      images: [ogImage],
      creator: `@${tweet.author.screen_name}`,
    },
    alternates: {
      types: {
        'application/json': `${baseUrl}/api/share/tweet/${username}/${id}`,
      },
    },
  }
}
