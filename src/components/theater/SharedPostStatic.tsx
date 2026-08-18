import type { ReactNode } from 'react'
import { formatCount, formatRelativeTime } from '@/lib/utils/format'

/**
 * Server-rendered, `sr-only` crawlable markup for the shared-mode theater
 * (docs/specs/theater-first.md §3, PR 3 SEO invariant #3): the tweet/reel/
 * TikTok/Short `<article>` the *PreviewLanding components used to render
 * visibly now renders here instead, present in the HTML for bots and screen
 * readers but visually hidden behind the theater. This is a plain server
 * component (no 'use client', no interactivity, no media pipeline) — it only
 * needs to reproduce the semantic content + engagement facts that were
 * already server-rendered, not the playback/download UI (that's the
 * theater's job now).
 *
 * Never touches JSON-LD (still built and rendered by the pages themselves)
 * and never invents data — every prop here is something the page already
 * fetched server-side for `recordActivity()` / `generateMetadata()`.
 */

interface TweetProps {
  kind: 'tweet'
  username: string
  tweetId: string
  authorName?: string | null
  authorAvatarUrl?: string | null
  createdAt?: string | null
  /** X Article title, when this post is an Article (takes precedence over `text`). */
  articleTitle?: string | null
  text?: string | null
  replies?: number | null
  retweets?: number | null
  likes?: number | null
  views?: number | null
  sourceUrl: string
}

interface SimplePostProps {
  kind: 'instagram-reel' | 'tiktok-video' | 'youtube-short'
  authorName?: string | null
  handle?: string | null
  text?: string | null
  sourceUrl: string
  /** Footer label, matching the old Landing components' footer copy. */
  label: string
}

export type SharedPostStaticProps = (TweetProps | SimplePostProps) & { below?: ReactNode }

export function SharedPostStatic(props: SharedPostStaticProps) {
  return (
    <div className="sr-only">
      {props.kind === 'tweet' ? <TweetStatic {...props} /> : <SimplePostStatic {...props} />}
      {props.below}
    </div>
  )
}

function TweetStatic({
  username,
  authorName,
  authorAvatarUrl,
  createdAt,
  articleTitle,
  text,
  replies,
  retweets,
  likes,
  views,
  sourceUrl,
}: TweetProps) {
  return (
    <article data-content="tweet">
      <header>
        <a href={sourceUrl}>
          {authorAvatarUrl && <img src={authorAvatarUrl} alt="" />}
          <p>{authorName || username}</p>
          <p>@{username}</p>
        </a>
        {createdAt && (
          <a href={sourceUrl}>
            <span>{formatRelativeTime(createdAt)}</span>
          </a>
        )}
      </header>
      <div>{articleTitle ? <h2>{articleTitle}</h2> : <p>{text}</p>}</div>
      <footer>
        <span>{formatCount(replies || 0)} replies</span>
        <span>{formatCount(retweets || 0)} reposts</span>
        <span>{formatCount(likes || 0)} likes</span>
        {typeof views === 'number' && <span>{formatCount(views)} views</span>}
      </footer>
    </article>
  )
}

function SimplePostStatic({ kind, authorName, handle, text, sourceUrl, label }: SimplePostProps) {
  return (
    <article data-content={kind}>
      <header>
        <a href={sourceUrl}>
          <p>{authorName || handle || label}</p>
          {handle && <p>{handle}</p>}
        </a>
      </header>
      {text && (
        <div>
          <p>{text}</p>
        </div>
      )}
      <footer>
        <span>{label}</span>
        <a href={sourceUrl}>View original</a>
      </footer>
    </article>
  )
}
