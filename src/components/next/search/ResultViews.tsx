'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { articleHeadline, postAuthor, postCoverSrc, postText } from '../post'
import { MediaChip, NxImage, Scrim } from '../primitives'
import { saversLine } from '../savers'
import {
  groupResults,
  KIND_WORD,
  kindOf,
  matchReason,
  matchShort,
  openHref,
  previewVideoSrc,
  resultKey,
  splitByStrength,
  STRENGTH_LABEL,
  strengthOfItem,
  type MatchSignal,
  type SearchResultItem,
} from './model'
import { SaversMark, mediaBadge, ResultTile, StrengthMeter, useReducedMotion } from './ResultTile'

/** "Video · 0:41 · in the video" (no repeated words when there is no duration). */
function queueMeta(item: SearchResultItem): string {
  const kindWord = KIND_WORD[kindOf(item)]
  const badge = mediaBadge(item)
  return [
    STRENGTH_LABEL[strengthOfItem(item)],
    kindWord,
    badge && badge !== kindWord ? badge : null,
    matchShort(item),
  ]
    .filter(Boolean)
    .join(' · ')
}

function headlineFor(item: SearchResultItem): string {
  const kind = kindOf(item)
  return kind === 'article' ? articleHeadline(item.post) : postText(item.post)
}

/**
 * The best match, large. A video plays muted on a loop (search by meaning,
 * then it plays); anything else shows its cover or its words.
 */
export function BestMatch({
  item,
  className,
  href,
}: {
  item: SearchResultItem
  className?: string
  href?: string
}) {
  const kind = kindOf(item)
  const cover = postCoverSrc(item.post)
  const reduced = useReducedMotion()
  const videoSrc = reduced ? null : previewVideoSrc(item.post)
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const author = postAuthor(item.post)
  const text = headlineFor(item)
  const badge = mediaBadge(item)

  useEffect(() => setPlaying(false), [videoSrc])

  if (kind === 'post' || !cover) {
    return (
      <Link
        href={href ?? openHref(item)}
        aria-label={`Best match: ${author.name}. ${text}`}
        className={cn(
          'relative flex flex-col justify-center gap-4 overflow-hidden rounded-[18px] bg-nx-cream p-8 text-nx-ink outline outline-2 outline-offset-[3px] outline-nx-accent md:p-12',
          className,
        )}
      >
        <MediaChip tone="accent" className="left-3.5 top-3.5">
          Best match
        </MediaChip>
        <StrengthMeter
          strength={strengthOfItem(item)}
          withLabel
          tone="cream"
          className="absolute left-3.5 top-12"
        />
        <span className="text-sm font-bold">{author.handle || author.name}</span>
        <span className="line-clamp-[8] font-nx-serif text-[30px] leading-[1.08] md:text-[40px]">
          {text}
        </span>
        <SaversMark item={item} className="right-3.5 top-3.5" />
      </Link>
    )
  }

  return (
    <Link
      href={href ?? openHref(item)}
      aria-label={`Best match: ${author.name}. ${text}`}
      className={cn(
        'relative block overflow-hidden rounded-[18px] bg-nx-stage outline outline-2 outline-offset-[3px] outline-nx-accent',
        className,
      )}
    >
      <img
        src={cover}
        alt=""
        aria-hidden
        className="absolute -inset-10 h-[calc(100%+80px)] w-[calc(100%+80px)] object-cover opacity-80 blur-[34px] brightness-[0.45]"
      />
      <NxImage
        src={cover}
        alt=""
        reveal="fade"
        loading="eager"
        className="absolute inset-0 h-full w-full object-contain"
      />
      {videoSrc && (
        <video
          ref={videoRef}
          key={videoSrc}
          src={videoSrc}
          poster={cover}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-hidden
          onPlaying={() => setPlaying(true)}
          onError={() => setPlaying(false)}
          className={cn(
            'absolute inset-0 h-full w-full object-contain transition-opacity duration-300',
            playing ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      <MediaChip tone="accent" className="left-3.5 top-3.5">
        {playing ? `Playing${badge ? ` · ${badge}` : ''}` : 'Best match'}
      </MediaChip>
      <StrengthMeter
        strength={strengthOfItem(item)}
        withLabel
        className="absolute left-3.5 top-12"
      />
      <SaversMark item={item} className="right-3.5 top-3.5" />
      {!playing && kind !== 'photo' && kind !== 'article' && (
        <span
          aria-hidden
          className="nx-plate absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-nx-cream"
        >
          <Play className="ml-0.5 h-5 w-5" fill="currentColor" strokeWidth={0} />
        </span>
      )}
      <Scrim className="gap-2 px-5 pb-5 pt-20">
        <span className="text-sm font-bold">{author.handle || author.name}</span>
        {text && <span className="line-clamp-2 text-[17px] leading-[1.35]">{text}</span>}
      </Scrim>
    </Link>
  )
}

/** Masonry columns: 2 on phones, 3 on tablets, 4 on wide screens. */
type HrefFor = (item: SearchResultItem) => string

export function Masonry({
  items,
  columns = 'columns-2 md:columns-3 2xl:columns-4',
  onOpen,
  hrefFor,
  showStrength = true,
}: {
  items: SearchResultItem[]
  columns?: string
  onOpen?: (item: SearchResultItem) => void
  hrefFor?: HrefFor
  showStrength?: boolean
}) {
  return (
    <ul className={cn('list-none gap-2 p-0 md:gap-3', columns)}>
      {items.map((item) => (
        <li key={resultKey(item)} className="mb-2 break-inside-avoid md:mb-3">
          <ResultTile
            item={item}
            onOpen={onOpen}
            href={hrefFor?.(item)}
            showStrength={showStrength}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * The heading over results that are only related: why a chameleon shows up
 * for "frog". Plain words, no scores.
 */
export function RelatedHeading({ query, count }: { query: string; count: number }) {
  return (
    <div className="flex flex-col gap-1 border-t border-nx-hairline pt-5">
      <h2 className="m-0 flex items-center gap-2.5 font-nx-serif text-[24px] font-normal md:text-[28px]">
        <StrengthMeter strength="related" />
        <span>{query.trim() ? `Related to “${query.trim()}”` : 'Related'}</span>
      </h2>
      <p className="m-0 text-[13px] text-nx-muted">
        {`${count === 1 ? 'This one is' : `These ${count} are`} close in meaning, but not exactly what you described.`}
      </p>
    </div>
  )
}

/** Bento: the best match large beside a masonry of the rest (stacked on phones). */
export function BentoView({
  items,
  query = '',
  onOpen,
  hrefFor,
}: {
  items: SearchResultItem[]
  /** For the "Related to …" heading. */
  query?: string
  onOpen?: (item: SearchResultItem) => void
  hrefFor?: HrefFor
}) {
  const { matches, related } = splitByStrength(items)
  const [lead, ...rest] = matches
  if (!lead) return null
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <BestMatch
          item={lead}
          href={hrefFor?.(lead)}
          className="h-[min(62vh,560px)] w-full shrink-0 lg:sticky lg:top-4 lg:h-[640px] lg:w-[46%]"
        />
        {rest.length > 0 && (
          <div className="min-w-0 flex-1">
            <Masonry
              items={rest}
              columns="columns-2 md:columns-3 lg:columns-2 xl:columns-3"
              onOpen={onOpen}
              hrefFor={hrefFor}
            />
          </div>
        )}
      </div>
      {related.length > 0 && (
        <section className="flex flex-col gap-3">
          <RelatedHeading query={query} count={related.length} />
          <Masonry items={related} onOpen={onOpen} hrefFor={hrefFor} />
        </section>
      )}
    </div>
  )
}

/** Groups: rows of results by how they matched, each playable on its own. */
export function GroupsView({
  items,
  onPlayGroup,
  onOpen,
  hrefFor,
}: {
  items: SearchResultItem[]
  onPlayGroup: (signal: MatchSignal) => void
  onOpen?: (item: SearchResultItem) => void
  hrefFor?: HrefFor
}) {
  return (
    <div className="flex flex-col gap-6">
      {groupResults(items).map((group) => (
        <section
          key={group.signal}
          aria-labelledby={`group-${group.signal}`}
          className="flex flex-col gap-2.5"
        >
          <div className="flex items-baseline gap-3">
            <h2
              id={`group-${group.signal}`}
              className="m-0 font-nx-serif text-[24px] font-normal md:text-[26px]"
            >
              {group.name}
            </h2>
            <span className="text-[13px] text-nx-muted">
              {group.items.length === 1 ? '1 post' : `${group.items.length} posts`}
            </span>
            <button
              type="button"
              onClick={() => onPlayGroup(group.signal)}
              className="ml-auto flex h-10 items-center gap-1.5 rounded-full border border-nx-hairline px-3.5 text-[13px] text-nx-cream hover:border-nx-muted"
            >
              <Play aria-hidden className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
              <span>Play this group</span>
            </button>
          </div>
          <ul className="-mx-3 flex list-none gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
            {group.items.map((item) => (
              <li key={resultKey(item)} className="w-[150px] shrink-0 md:w-[220px]">
                <ResultTile item={item} onOpen={onOpen} href={hrefFor?.(item)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Queue: the order they'd play in, with the first one large and why it's first. */
export function QueueView({
  items,
  onOpen,
  hrefFor,
}: {
  items: SearchResultItem[]
  onOpen?: (item: SearchResultItem) => void
  hrefFor?: HrefFor
}) {
  const [lead] = items
  if (!lead) return null
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 lg:sticky lg:top-4">
        <BestMatch item={lead} href={hrefFor?.(lead)} className="h-[min(56vh,420px)] w-full" />
        <p className="m-0 text-sm text-nx-soft">
          <span className="font-bold text-nx-cream">Why this one: </span>
          <span>{matchReason(lead)}</span>
        </p>
      </div>
      <ol className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1.5 p-0">
        {items.map((item, i) => {
          const cover = postCoverSrc(item.post)
          const kind = kindOf(item)
          const firstRelated =
            strengthOfItem(item) === 'related' &&
            (i === 0 || strengthOfItem(items[i - 1]) !== 'related')
          return (
            <li key={resultKey(item)}>
              {firstRelated && i > 0 && (
                <span className="flex items-center gap-2 px-1 pb-1.5 pt-3 text-[13px] text-nx-muted">
                  <StrengthMeter strength="related" tone="plate" />
                  <span>Related: close in meaning, not exactly it</span>
                </span>
              )}
              <Link
                href={hrefFor?.(item) ?? openHref(item)}
                onClick={onOpen ? () => onOpen(item) : undefined}
                className={cn(
                  'flex min-h-[72px] items-center gap-3 rounded-[14px] border px-2.5 py-2',
                  i === 0
                    ? 'border-nx-accent bg-[#2b2510]'
                    : 'border-transparent bg-[#14120e] hover:bg-nx-surface',
                )}
              >
                <span
                  className={cn(
                    'w-6 shrink-0 text-right font-nx-serif text-[20px]',
                    i === 0 ? 'text-nx-accent' : 'text-nx-muted',
                  )}
                >
                  {String(i + 1)}
                </span>
                {cover ? (
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-nx-surface">
                    <NxImage
                      src={cover}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-nx-cream font-nx-serif text-[28px] text-nx-ink"
                  >
                    “
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] text-nx-cream">
                    {headlineFor(item) ||
                      `${KIND_WORD[kind]} by ${postAuthor(item.post).handle || postAuthor(item.post).name}`}
                  </span>
                  <span className="truncate text-xs text-nx-muted">{queueMeta(item)}</span>
                </span>
                <span className="shrink-0 rounded-full border border-nx-hairline px-2 py-1 text-[11px] text-nx-soft">
                  {item.post.savers?.length
                    ? saversLine(item.post.savers)
                    : item.saved
                      ? 'Yours'
                      : 'Everyone'}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
