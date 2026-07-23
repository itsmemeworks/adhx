import type { FxTwitterResponse } from '@/lib/media/fxembed'
import { formatCount } from './format'
import { truncateWordBoundary, buildContentDescription } from './content-metadata'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

const TITLE_SUFFIX = ' | ADHX'
const TITLE_CONTENT_LEN = 60
/** Max length for "<content> — @handle" before we drop the handle to stay tidy. */
const TITLE_WITH_HANDLE_BUDGET = 70

/** Fallback title lead when a tweet has no text of its own to lead with. */
function mediaFallbackLabel(tweet: FxTweet, screenName: string): string {
  if (tweet.media?.videos?.length) return `Video by @${screenName}`
  if (tweet.media?.photos?.length) return `Photo by @${screenName}`
  if (tweet.quote) return `Quoting @${tweet.quote.author.screen_name}`
  return `Post by @${screenName}`
}

/**
 * Content-first `<title>` for a tweet preview: leads with the post's own text
 * (or an X Article's headline) instead of the "Preview @user's tweet" utility
 * pitch. Falls back to a media-aware label for tweets with no text of their
 * own (photo/video/quote-only). Keeps the @handle only when it still fits a
 * sane budget, then a short " | ADHX" brand suffix.
 */
export function buildTweetTitle(tweet: FxTweet, screenName: string): string {
  if (tweet.article?.title) {
    return `${tweet.article.title}${TITLE_SUFFIX}`
  }

  const ownText = truncateWordBoundary(tweet.text || '', TITLE_CONTENT_LEN)
  const content = ownText || mediaFallbackLabel(tweet, screenName)

  const withHandle = `${content} — @${screenName}`
  if (ownText && withHandle.length <= TITLE_WITH_HANDLE_BUDGET) {
    return `${withHandle}${TITLE_SUFFIX}`
  }
  return `${content}${TITLE_SUFFIX}`
}

/**
 * Content-first meta description (~160 chars) for the SERP snippet: the
 * tweet's own text (or article excerpt) up front, with an engagement suffix
 * ("1.4K likes, 84 reposts") appended when the counts are notable enough to
 * help CTR. Kept deliberately separate from the richer OG/Twitter card
 * description (`buildDescription` in the page component), which carries
 * quote/external-link context for social unfurls instead.
 */
export function buildTweetSeoDescription(tweet: FxTweet): string {
  const base = tweet.text || tweet.article?.preview_text || tweet.article?.title || ''

  const engagementParts: string[] = []
  if (tweet.likes >= 100) engagementParts.push(`${formatCount(tweet.likes)} likes`)
  if (tweet.retweets >= 50) engagementParts.push(`${formatCount(tweet.retweets)} reposts`)
  const suffix = engagementParts.length > 0 ? ` (${engagementParts.join(', ')})` : ''

  return buildContentDescription(base, suffix)
}
