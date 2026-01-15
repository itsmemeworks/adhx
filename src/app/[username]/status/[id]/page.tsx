import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { getSession } from '@/lib/auth/session'
import { QuickAddLanding } from '@/components/QuickAddLanding'
import { TweetPreviewLanding } from '@/components/TweetPreviewLanding'
import { fetchTweetData } from '@/lib/media/fxembed'
import { truncate } from '@/lib/utils/format'
import { getOgImage } from '@/lib/utils/og-image'

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
    return <TweetPreviewLanding username={username} tweetId={id} tweet={tweet} isAuthenticated={!!session} />
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

  // Build dynamic metadata with tweet content
  const tweetText = tweet.text || ''
  const description = truncate(tweetText, 160)
  const title = `@${tweet.author.screen_name}: "${truncate(tweetText, 50)}" - Save to ADHX`

  // Select best OG image: direct media → article cover → quote media → external → logo
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const ogImage = getOgImage(tweet, baseUrl)

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title: `@${tweet.author.screen_name} on X`,
      description,
      siteName: 'ADHX',
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
      title: `Save @${tweet.author.screen_name}'s tweet - ADHX`,
      description,
      images: [ogImage],
      creator: '@adhx_app',
    },
  }
}
