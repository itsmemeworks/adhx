import type { FxTwitterResponse } from '@/lib/media/fxembed'
import { formatCount } from './format'
import { truncateWordBoundary, buildSnippetDescription, attributionFact } from './content-metadata'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

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
 * sane budget. No brand suffix — the root layout's title template
 * (`%s | ADHX`) appends it exactly once.
 */
export function buildTweetTitle(tweet: FxTweet, screenName: string): string {
  if (tweet.article?.title) {
    return tweet.article.title
  }

  const ownText = truncateWordBoundary(tweet.text || '', TITLE_CONTENT_LEN)
  const content = ownText || mediaFallbackLabel(tweet, screenName)

  const withHandle = `${content} — @${screenName}`
  if (ownText && withHandle.length <= TITLE_WITH_HANDLE_BUDGET) {
    return withHandle
  }
  return content
}

/** What this page actually holds, for the description's metadata trail. */
function mediaFact(tweet: FxTweet): string | undefined {
  if (tweet.article?.title) return 'Article'
  const videos = tweet.media?.videos?.length ?? 0
  const photos = tweet.media?.photos?.length ?? 0
  if (videos > 1) return `${videos} videos`
  if (videos === 1) return 'Video'
  if (photos > 1) return `${photos} photos`
  if (photos === 1) return 'Photo'
  if (tweet.quote) return 'Quote post'
  return undefined
}

/** "7.3K likes, 652 reposts" — omitted below the thresholds where it's noise. */
function engagementFact(tweet: FxTweet): string | undefined {
  const parts: string[] = []
  if (tweet.likes >= 100) parts.push(`${formatCount(tweet.likes)} likes`)
  if (tweet.retweets >= 50) parts.push(`${formatCount(tweet.retweets)} reposts`)
  return parts.length > 0 ? parts.join(', ') : undefined
}

/**
 * Meta description (~160 chars) for the SERP snippet. Continues the post text
 * where `title` stopped rather than restating it, then appends what the page
 * holds and the reason to open ours: x.com isn't crawlable and needs a login,
 * so "readable without an X account" is the actual differentiator for the
 * exact-phrase tweet searches this corpus ranks for.
 *
 * Kept deliberately separate from the richer OG/Twitter card description
 * (`buildDescription` in the page component), which carries quote/external-link
 * context for social unfurls instead.
 */
export function buildTweetSeoDescription(
  tweet: FxTweet,
  screenName: string,
  title: string,
): string {
  const content = tweet.text || tweet.article?.preview_text || tweet.article?.title || ''

  const facts = [
    attributionFact(title, `@${screenName}`, 'X'),
    mediaFact(tweet),
    engagementFact(tweet),
  ].filter((fact): fact is string => Boolean(fact))

  return buildSnippetDescription({
    title,
    content,
    facts,
    closer: 'Read the full post — no X account needed.',
  })
}
