import type { FxTwitterResponse } from '@/lib/media/fxembed'
import { formatCount, truncate } from './format'
import { truncateWordBoundary, buildSnippetDescription, attributionFact } from './content-metadata'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

const TITLE_CONTENT_LEN = 60
/** Max length for "<content> — @handle" before we drop the handle to stay tidy. */
const TITLE_WITH_HANDLE_BUDGET = 70
const SOCIAL_QUOTE_LEN = 100
const SOCIAL_LINK_LEN = 80
const SOCIAL_CONTINUATION_LEN = 120

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
 * Holds and the reason to open ours: watch/send without the source app
 * (video) or readable without an X account (text/article).
 *
 * The richer OG/Twitter card description uses the same title-aware content
 * continuation while prioritizing quote/external-link context.
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
    closer: tweet.media?.videos?.length
      ? 'Watch and send it — no X app needed.'
      : 'Read the full post — no X account needed.',
  })
}

/**
 * Social-unfurl description for X posts. Prioritizes distinct quote/external
 * context, then continues past the title and appends compact content facts.
 */
export function buildTweetOgDescription(tweet: FxTweet, screenName: string, title: string): string {
  const titleWithoutHandle = title.replace(/\s+—\s+@\S+$/, '').trim()
  const titleLead = titleWithoutHandle.replace(/…$/, '').trim()
  const seen = new Set([descriptionKey(titleLead)])
  const coveredSources = [titleWithoutHandle]
  const parts: string[] = []
  const appendUnique = (display: string, source = display) => {
    const key = descriptionKey(source)
    if (!key || seen.has(key)) return
    seen.add(key)
    parts.push(display)
  }

  // The title already carries the wrapper post's opening. Put the distinct
  // quoted/linked subject first so social cards show it before truncating.
  if (tweet.quote?.text) {
    const quote = uncoveredDescriptionPart(tweet.quote.text, coveredSources)
    if (quote) {
      appendUnique(
        `QT @${tweet.quote.author.screen_name}: "${quote.continues ? '…' : ''}${truncate(quote.text, SOCIAL_QUOTE_LEN)}"`,
        quote.text,
      )
      coveredSources.push(tweet.quote.text)
    }
  }
  if (tweet.external?.title) {
    const link = uncoveredDescriptionPart(tweet.external.title, coveredSources)
    if (link) {
      appendUnique(
        `\u{1f517} ${link.continues ? '…' : ''}${truncate(link.text, SOCIAL_LINK_LEN)}`,
        link.text,
      )
      coveredSources.push(tweet.external.title)
    }
  }

  const content = tweet.text || tweet.article?.preview_text || tweet.article?.title || ''
  const remainder = uncoveredDescriptionPart(content, coveredSources)
  if (remainder) {
    appendUnique(
      `${remainder.continues ? '…' : ''}${truncate(remainder.text, SOCIAL_CONTINUATION_LEN)}`,
      remainder.text,
    )
  }

  for (const fact of [
    attributionFact(title, `@${screenName}`, 'X'),
    mediaFact(tweet),
    engagementFact(tweet),
  ]) {
    if (fact) appendUnique(fact)
  }

  appendUnique(
    tweet.media?.videos?.length
      ? 'Watch and send it — no X app needed.'
      : 'Read the full post — no X account needed.',
  )

  return truncate(parts.join(' — '), 500)
}

function descriptionKey(value: string): string {
  return compactDescriptionPart(value)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[“”"'‘’….,!?()[\]{}:;—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function compactDescriptionPart(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function uncoveredDescriptionPart(
  value: string,
  coveredSources: string[],
): { text: string; continues: boolean } | null {
  let text = compactDescriptionPart(value)
  let continues = false

  for (const covered of coveredSources) {
    const coveredKey = descriptionKey(covered)
    const textKey = descriptionKey(text)
    if (!textKey || coveredKey === textKey) return null

    const remainder = descriptionAfterCoveredPrefix(covered, text)
    if (descriptionKey(remainder) !== textKey) {
      text = remainder
      continues = true
    }
  }

  return text ? { text, continues } : null
}

function descriptionAfterCoveredPrefix(covered: string, value: string): string {
  const text = compactDescriptionPart(value.replace(/https?:\/\/\S+/g, ''))
  const compactCovered = compactDescriptionPart(covered.replace(/https?:\/\/\S+/g, ''))
  const coveredWasTruncated = compactCovered.endsWith('…')
  const lead = compactCovered.replace(/[“”"'‘’….,!?()[\]{}:;—–-]+$/, '').trim()
  if (!lead || !text.toLowerCase().startsWith(lead.toLowerCase())) return text

  const boundary = text[lead.length]
  if (boundary && !coveredWasTruncated && !/[\s“”"'‘’.,!?()[\]{}:;—–-]/.test(boundary)) {
    return text
  }
  return text
    .slice(lead.length)
    .replace(/^[\s“”"'‘’….,!?()[\]{}:;—–-]+/, '')
    .trim()
}
