'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Link2, Radio } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import { cn } from '@/lib/utils'
import { NxImage } from '../primitives'
import { nextPostKind, postCoverSrc, postText } from '../post'
import { momentPlayHref } from '../theater/queue'
import { NxHeader } from '../channels/ChannelParts'
import { SaveTools } from '../onboarding/SaveTools'
import { plural, timeAgo, useMoment } from './live'
import { Faces } from './LiveTogether'
import { savingLine, tuneInLabel, watchingLine } from './people'
import { SaverFaces } from '../SaverFaces'
import type { Saver } from '@/lib/people/types'

/**
 * One moment's page (`/moments/{slug}`): what it is, how fast it's moving,
 * and its posts newest first. New saves drop in at the top as they land.
 */

function asFeed(post: unknown): FeedItem {
  return post as FeedItem
}

function Tile({
  post,
  savedAt,
  people,
  fresh,
  hue,
  slug,
  savers,
}: {
  post: FeedItem
  savedAt: string
  people: number
  fresh: boolean
  hue: string
  slug: string
  /** Members only. */
  savers?: Saver[]
}) {
  const src = postCoverSrc(post)
  const key = `${post.platform ?? 'twitter'}:${post.id}`
  const text = postText(post)
    .replace(/https?:\/\/\S+/g, '')
    .trim()
  return (
    <Link
      href={momentPlayHref(slug, key)}
      aria-label={`Play ${text || 'this post'}`}
      className={cn(
        'relative block h-[230px] overflow-hidden rounded-2xl bg-nx-surface',
        fresh && 'animate-nx-drop-in',
      )}
      style={fresh ? { boxShadow: `0 0 0 3px ${hue}, 0 0 36px ${hue}80` } : undefined}
    >
      {src ? (
        <NxImage src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 overflow-hidden bg-nx-cream px-3 pb-3 pt-11 font-nx-serif text-[16px] leading-[1.15] text-nx-ink">
          {text}
        </span>
      )}
      <span
        className={cn(
          'absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold',
          fresh ? 'text-black' : 'nx-plate text-white',
        )}
        style={fresh ? { background: hue } : undefined}
      >
        {fresh ? 'Just saved' : timeAgo(savedAt)}
      </span>
      {savers && savers.length > 0 ? (
        <SaverFaces savers={savers} tone="plate" compact className="absolute right-2.5 top-2" />
      ) : (
        people > 1 && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-nx-cream px-2.5 py-1 text-[11px] font-extrabold text-black">
            {`Saved by ${people}`}
          </span>
        )
      )}
      {nextPostKind(post) === 'video' && (
        <span className="nx-plate absolute bottom-2.5 right-2.5 rounded-md px-2 py-0.5 text-[11px] font-bold text-white">
          Video
        </span>
      )}
      {src && text && (
        <span className="nx-scrim nx-text-shadow absolute inset-x-0 bottom-0 line-clamp-2 px-2.5 pb-2.5 pt-8 text-xs font-semibold text-white">
          {text}
        </span>
      )}
    </Link>
  )
}

export function MomentScreen({ slug }: { slug: string }) {
  const { detail, missing, fresh, watching, watchers } = useMoment(slug)
  const [copied, setCopied] = useState(false)

  if (missing) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black px-6 text-center font-nx-sans text-white">
        <h1 className="m-0 font-nx-serif text-[36px] font-normal">This moment has passed</h1>
        <p className="m-0 text-white/65">People have moved on. See what they’re saving now.</p>
        <Link
          href="/now"
          className="rounded-full bg-nx-accent px-5 py-3 text-sm font-bold text-black"
        >
          Right now
        </Link>
      </main>
    )
  }

  const m = detail?.moment
  const hue = m?.hue ?? '#ffd23f'
  const max = Math.max(1, ...(detail?.bars ?? [1]))
  const videos = detail
    ? detail.items.filter((i) => nextPostKind(asFeed(i.post)) === 'video').length
    : 0

  return (
    <div className="min-h-dvh bg-black font-nx-sans text-nx-cream">
      <NxHeader current="now">
        <SaveTools />
      </NxHeader>

      <main className="mx-auto flex max-w-[1600px] flex-col gap-7 px-4 pb-16 md:px-7">
        <section className="flex flex-wrap items-stretch gap-7">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col justify-end gap-3.5 py-2">
            <span
              className="flex items-center gap-2.5 text-xs font-extrabold tracking-[.12em]"
              style={{ color: hue }}
            >
              <span
                aria-hidden
                className="block h-2.5 w-2.5 rounded-full animate-nx-live-pulse"
                style={{ background: hue }}
              />
              <span>{m?.rising ? 'RIGHT NOW · RISING' : 'RIGHT NOW'}</span>
            </span>
            <h1 className="m-0 font-nx-serif text-[52px] font-normal leading-[0.95] md:text-[80px]">
              {m?.title ?? ' '}
            </h1>
            {m && (
              <p className="m-0 max-w-[620px] text-[17px] leading-[1.45] text-nx-soft">
                {`${plural(m.posts, 'post')} saved by ${plural(m.people, 'person', 'people')}${
                  videos > m.posts / 2 ? ', mostly videos' : ''
                }. Last save ${timeAgo(m.lastAt)}.`}
              </p>
            )}
            {m?.savers && m.savers.length > 0 && (
              <p className="m-0 flex items-center gap-2.5 text-[15px] text-nx-soft">
                <Faces people={m.savers} size={30} ring="#000" max={5} />
                <span>{savingLine(m.savers, m.people)}</span>
              </p>
            )}
            {watchers.length > 0 && (
              <p className="m-0 flex items-center gap-2.5 text-[14px] text-nx-soft">
                <Faces people={watchers} size={26} live ring="#000" />
                <span>{watchingLine(watchers)}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2.5 pt-1.5">
              <Link
                href={momentPlayHref(slug)}
                className="flex h-12 items-center gap-2 rounded-full px-[22px] text-base font-extrabold text-black"
                style={{ background: hue }}
              >
                <Radio aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.4} />
                <span>{tuneInLabel(watchers)}</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(`${window.location.origin}/moments/${slug}`)
                    .then(() => setCopied(true))
                }}
                className="flex h-12 items-center gap-2 rounded-full border border-nx-cream/30 px-5 text-[15px] font-semibold"
              >
                <Link2 aria-hidden className="h-4 w-4" />
                <span>{copied ? 'Link copied' : 'Share'}</span>
              </button>
            </div>
          </div>

          <aside
            aria-label="How it’s moving"
            className="flex flex-[1_1_340px] flex-col gap-3.5 rounded-[22px] bg-nx-surface p-5"
          >
            <span className="text-[13px] font-bold text-nx-muted">Saves, last 30 minutes</span>
            <div aria-hidden className="flex h-24 items-end gap-1">
              {(detail?.bars ?? new Array(30).fill(0)).map((v, i, all) => (
                <span
                  key={i}
                  className="block flex-1 rounded-[3px] transition-[height] duration-500"
                  style={{
                    height: `${Math.max(6, Math.round((v / max) * 96))}px`,
                    background: i === all.length - 1 ? hue : `${hue}73`,
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { v: m?.people ?? 0, l: 'people saved' },
                { v: m?.posts ?? 0, l: 'posts' },
                { v: watching, l: 'watching now' },
              ].map(({ v, l }) => (
                <div key={l} className="flex flex-col gap-0.5">
                  <span className="font-nx-serif text-[36px] leading-none tabular-nums">{v}</span>
                  <span className="text-xs text-nx-muted">{l}</span>
                </div>
              ))}
            </div>
            <span className="text-xs text-nx-muted">
              {m?.savers
                ? 'Only your people see who saved what. Private saves never count.'
                : 'Counts are anonymous. Nobody sees who saved what.'}
            </span>
          </aside>
        </section>

        <h2 className="m-0 text-lg font-bold">Newest first, live</h2>
        {detail ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {detail.items.map((item) => {
              const post = asFeed(item.post)
              const key = `${post.platform ?? 'twitter'}:${post.id}`
              return (
                <Tile
                  key={key}
                  post={post}
                  savedAt={item.savedAt}
                  people={item.people}
                  fresh={!!fresh && fresh.startsWith(`${key}@`)}
                  hue={hue}
                  slug={slug}
                  savers={item.savers}
                />
              )
            })}
          </div>
        ) : (
          <div aria-hidden className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="nx-shimmer animate-nx-shimmer block h-[230px] rounded-2xl" />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
