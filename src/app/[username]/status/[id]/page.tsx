import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
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

  // Check authentication
  const session = await getSession()

  if (!session) {
    // Fetch tweet data server-side for rich preview
    const tweet = await getTweetData(username, id)

    // Show rich preview if we have tweet data, otherwise fall back to minimal version
    if (tweet) {
      return <TweetPreviewLanding username={username} tweetId={id} tweet={tweet} />
    }

    // Fallback: Show minimal landing page if FxTwitter API failed
    return <QuickAddLanding username={username} tweetId={id} />
  }

  // User is authenticated - add the tweet via the API
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const tweetUrl = `https://x.com/${username}/status/${id}`

  // Get the actual session cookie (JWT token) to forward to the API
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('adhx_session')

  try {
    const response = await fetch(`${baseUrl}/api/tweets/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the actual JWT session cookie
        Cookie: `adhx_session=${sessionCookie?.value || ''}`,
      },
      body: JSON.stringify({ url: tweetUrl, source: 'url_prefix' }),
    })

    const data = await response.json()

    if (data.success) {
      // Redirect with success result params
      const params = new URLSearchParams({
        added: 'success',
        tweetId: data.bookmark.id,
        author: data.bookmark.author,
        text: (data.bookmark.text || '').slice(0, 200), // Limit text length for URL
      })
      redirect(`/?${params.toString()}`)
    } else if (data.isDuplicate) {
      // Redirect with duplicate result params
      const params = new URLSearchParams({
        added: 'duplicate',
        tweetId: data.bookmark.id,
        author: data.bookmark.author,
        text: (data.bookmark.text || '').slice(0, 200),
      })
      redirect(`/?${params.toString()}`)
    } else {
      // Error from API - redirect with error params
      const params = new URLSearchParams({
        added: 'error',
        error: data.error || 'Failed to add tweet',
      })
      redirect(`/?${params.toString()}`)
    }
  } catch (error) {
    // Re-throw redirect errors - Next.js uses these internally
    // Redirect errors have a 'digest' property starting with 'NEXT_REDIRECT'
    if (error && typeof error === 'object' && 'digest' in error) {
      const digest = (error as { digest: string }).digest
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }

    console.error('Failed to add tweet:', error)
    const params = new URLSearchParams({
      added: 'error',
      error: error instanceof Error ? error.message : 'Failed to add tweet',
    })
    redirect(`/?${params.toString()}`)
  }
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
