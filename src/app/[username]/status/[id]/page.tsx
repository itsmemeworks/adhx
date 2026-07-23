import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { getSession } from '@/lib/auth/session'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { isLikelyBot } from '@/lib/activity/bot'
import { QuickAddLanding } from '@/components/QuickAddLanding'
import { TweetPreviewLanding } from '@/components/TweetPreviewLanding'
import { fetchTweetData, extractUrlsFromFacets, type FxTwitterResponse } from '@/lib/media/fxembed'
import { fetchOgMetadata } from '@/lib/utils/og-fetch'
import { truncate } from '@/lib/utils/format'
import { getOgImages } from '@/lib/utils/og-image'
import { buildTweetTitle, buildTweetSeoDescription } from '@/lib/utils/tweet-metadata'
import { buildSocialMediaPostingLd, jsonLdScriptContent } from '@/lib/utils/structured-data'
import { RelatedSaves } from '@/components/RelatedSaves'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

interface Props {
  params: Promise<{ username: string; id: string }>
}

// Fetch tweet data from FxTwitter API. The route is dynamic (reads cookies for
// auth), so it is never full-route cached — the crawl stays cheap because
// fetchTweetData() caches the upstream FxTwitter response in the Next Data Cache
// (revalidate 3600), so repeat crawler hits to the same id don't re-hit the API.
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
 * Build Schema.org JSON-LD structured data for a tweet. Delegates to the shared
 * SocialMediaPosting builder — output stays equivalent to the previous inline
 * version (the status page always supplies headline/text/url/date/counts).
 */
function buildJsonLd(tweet: FxTweet, baseUrl: string, username: string, id: string) {
  // Keep the existing og-logo guard: only set `image` when it's real media,
  // never the fallback logo.
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

  // Enrich tweet with OG metadata from facet URLs when external is null, so a
  // tweet with a bare t.co link still renders a rich link preview. Runs the same
  // for saved and unsaved tweets — fetchTweetData's data cache already keeps
  // repeat crawls cheap, so there's no need to skip enrichment for saved tweets
  // (which previously degraded their preview).
  if (tweet && !tweet.external && !tweet.article) {
    const facetUrls = extractUrlsFromFacets(tweet)
    if (facetUrls.length > 0) {
      const og = await fetchOgMetadata(facetUrls[0].expanded_url)
      if (og) {
        tweet.external = {
          url: facetUrls[0].url,
          display_url: facetUrls[0].domain,
          expanded_url: facetUrls[0].expanded_url,
          title: og.title,
          description: og.description,
          thumbnail_url: og.image,
        }
      }
    }
  }

  // Show rich preview if we have tweet data
  if (tweet) {
    const previewAuthor = tweet.author?.screen_name || username
    // An X Article keeps its headline + cover in `tweet.article` (not
    // tweet.text/media), so resolve those explicitly — otherwise a
    // preview-only article would land in the pulse as a bare "Saved post".
    const articleCover = tweet.article?.cover_media?.media_info?.original_img_url || null
    const previewType = tweet.article?.title
      ? 'article'
      : tweet.media?.videos?.length
        ? 'video'
        : tweet.media?.photos?.length
          ? 'photo'
          : 'text'

    // Record a human preview for the public pulse (skip OG-unfurl crawlers).
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
        // Real media (or the article cover) only — no avatar fallback, so text
        // tweets stay "text" rather than being mistaken for photos.
        thumbnailUrl:
          articleCover ||
          tweet.media?.all?.[0]?.thumbnail_url ||
          tweet.media?.all?.[0]?.url ||
          null,
        contentType: previewType,
        url: previewPath('twitter', previewAuthor, id),
      })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const jsonLd = buildJsonLd(tweet, baseUrl, username, id)

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
        />
        <TweetPreviewLanding
          username={username}
          tweetId={id}
          tweet={JSON.parse(JSON.stringify(tweet))}
          isAuthenticated={!!session}
        />
        <RelatedSaves
          platform="twitter"
          bookmarkId={id}
          authorHandle={previewAuthor}
          contentType={previewType}
        />
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
      title: `Preview @${username}'s tweet`,
      description: 'Preview this tweet on ADHX',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const canonicalUrl = `${baseUrl}/${username}/status/${id}`

  // Content-first `<title>` + SERP snippet description — lead with what the
  // post actually says, not a "Preview @user's tweet" utility pitch (GSC
  // showed the old framing converting at 0.4% CTR).
  const title = buildTweetTitle(tweet, tweet.author.screen_name)
  const description = buildTweetSeoDescription(tweet)

  // The OG/Twitter card description stays the richer, longer version (quote +
  // external-link context) — that's what social apps render in the unfurl,
  // not the Google SERP snippet, so it can afford the extra length.
  const ogDescription = buildDescription(tweet)

  // Select best OG images with real dimensions
  const ogImages = getOgImages(tweet, baseUrl)

  // Unfurl headline (og + twitter): same content-first title as the page
  // <title> — dropping the old "Preview @user's tweet" framing here too.
  const ogTitle = title

  // Build OG video tags for video tweets
  const ogVideos = tweet.media?.videos?.length
    ? tweet.media.videos.slice(0, 1).map((video) => ({
        url: video.url,
        width: video.width,
        height: video.height,
        type: 'video/mp4' as const,
      }))
    : undefined

  // Use small square card for avatar OG images (text-only tweets), large banner for everything else
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
      type: 'article',
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
