'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Lock, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItem } from '@/components/feed/types'
import { autoPlayHref, channelPlayHref, recentPlayHref } from '../theater/queue'
import { LearningPill, LearningSheet, useLearningStatus } from '../onboarding/learning'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { ChannelCover, NxHeader, TopChannels, channelTitle, tilesFromPosts } from './ChannelParts'
import { NxImage } from '../primitives'
import {
  FromEveryoneRow,
  ROW,
  RowHeading,
  YourPeopleRow,
  type FriendChannelCardData,
  type GroupChannelCardData,
} from './PeopleRows'
import { ReactionsRow } from './ReactionsRow'

interface CoverItem {
  post: FeedItem
}

interface MyChannel {
  tag: string
  count: number
  isPublic: boolean
  shareUrl: string | null
  viewCount: number
  cloneCount: number
  rank: number | null
  covers: CoverItem[]
}

interface MadeForYou {
  slug: string
  name: string
  size: number
  covers: CoverItem[]
}

interface ChannelsResponse {
  username: string | null
  mine: MyChannel[]
  madeForYou: MadeForYou[]
  group?: GroupChannelCardData[]
  friends?: FriendChannelCardData[]
  canInvite?: boolean
}

function posts(covers: CoverItem[]): FeedItem[] {
  return covers.map((c) => c.post)
}

function countLabel(n: number): string {
  return n === 1 ? '1 post' : `${n} posts`
}

export function ChannelsScreen() {
  const [data, setData] = useState<ChannelsResponse | null>(null)
  const [error, setError] = useState(false)
  const [keeping, setKeeping] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [learningOpen, setLearningOpen] = useState(false)
  const learning = useLearningStatus({ fast: learningOpen })
  const paste = usePasteToSave({
    savedAction: (post) => ({
      label: 'Play',
      onClick: () => window.location.assign(recentPlayHref(post.key)),
    }),
  })

  const load = useCallback(() => {
    fetch('/api/channels', { credentials: 'same-origin' })
      .then((r) =>
        r.ok ? (r.json() as Promise<ChannelsResponse>) : Promise.reject(new Error('load')),
      )
      .then(setData)
      .catch(() => setError(true))
  }, [])
  useEffect(load, [load])

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2400)
  }

  const keep = async (channel: MadeForYou) => {
    setKeeping(channel.slug)
    try {
      const res = await fetch(`/api/channels/auto/${encodeURIComponent(channel.slug)}/keep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: false }),
      })
      if (!res.ok) throw new Error('keep')
      flash(`“${channel.name}” is one of your channels now. It’s private until you share it.`)
      load()
    } catch {
      flash('Couldn’t keep that channel. Try again.')
    } finally {
      setKeeping(null)
    }
  }

  return (
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-nx-cream">
      <NxHeader>
        <LearningPill status={learning.status} onOpen={() => setLearningOpen(true)} />
        {/* Desktop pastes anywhere on the page (⌘V), the pill kept for keyboards; phones need it. */}
        <PasteButton onClick={paste.pasteFromClipboard} keyboardOnlyFrom="md" />
      </NxHeader>
      <main className="mx-auto flex max-w-[1600px] flex-col gap-[30px] px-4 pb-16 pt-5 md:px-10 md:pt-[26px]">
        <h1 className="sr-only">Channels</h1>
        <div className="flex min-w-0 flex-col gap-[30px]">
          {error && (
            <p className="m-0 text-white/70">Channels didn’t load. Refresh to try again.</p>
          )}

          {!error && (
            <>
              <FromEveryoneRow channels={data ? (data.group ?? []) : null} seeAll="#nx-all" />
              <YourPeopleRow
                friends={data ? (data.friends ?? []) : null}
                canInvite={!!data?.canInvite}
              />
              <ReactionsRow />
            </>
          )}

          <section aria-labelledby="nx-mfy" className="flex flex-col gap-4">
            <RowHeading
              id="nx-mfy"
              title="Made for you"
              sub="Built from what you keep. No ad tech was consulted."
            />
            {data === null && !error ? (
              <div aria-hidden className="flex gap-3 overflow-hidden md:gap-5">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="nx-shimmer animate-nx-shimmer block h-[160px] w-[240px] shrink-0 rounded-[22px] md:flex-1"
                  />
                ))}
              </div>
            ) : data && data.madeForYou.length === 0 ? (
              <p className="m-0 text-sm text-nx-muted">
                These appear once enough of your saves are understood. Keep saving, they’ll show up
                here.
              </p>
            ) : (
              <>
                {/* Phones: rows, as on the phone app. */}
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden">
                  {data?.madeForYou.map((c) => {
                    const cover = posts(c.covers)
                      .map((p) => tilesFromPosts([p])[0])
                      .find((t) => t.img)
                    return (
                      <li
                        key={c.slug}
                        className="flex items-center gap-3.5 rounded-[20px] border border-white/[0.08] bg-nx-surface p-2.5"
                      >
                        {/* 20 px corners, 10 px padding, 1 px border: 9 px. */}
                        <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-[9px] bg-[#2a2620]">
                          {cover?.img && (
                            <NxImage
                              src={cover.img}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-base font-extrabold">{c.name}</span>
                          <span className="truncate text-[13px] text-nx-muted">
                            {`${countLabel(c.size)} · from what you keep`}
                          </span>
                          <button
                            type="button"
                            disabled={keeping === c.slug}
                            onClick={() => void keep(c)}
                            aria-label={`Keep ${c.name} as one of your channels`}
                            className="self-start text-[13px] font-semibold text-nx-accent disabled:opacity-60"
                          >
                            Keep
                          </button>
                        </span>
                        <Link
                          href={autoPlayHref(c.slug)}
                          aria-label={`Play ${c.name}, ${countLabel(c.size)}`}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2a2620] text-nx-cream"
                        >
                          <Play
                            aria-hidden
                            className="ml-0.5 h-4 w-4"
                            fill="currentColor"
                            strokeWidth={0}
                          />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                <ul className={cn(ROW, 'hidden md:grid md:grid-cols-3 xl:grid-cols-4')}>
                  {data?.madeForYou.map((c) => {
                    const cover = posts(c.covers)
                      .map((p) => tilesFromPosts([p])[0])
                      .find((t) => t.img)
                    return (
                      <li key={c.slug} className="relative w-[240px] shrink-0 md:w-auto">
                        <Link
                          href={autoPlayHref(c.slug)}
                          aria-label={`Play ${c.name}, ${countLabel(c.size)}`}
                          className="relative block h-[160px] overflow-hidden rounded-[22px] bg-nx-surface text-white"
                        >
                          {cover?.img ? (
                            <NxImage
                              src={cover.img}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          ) : (
                            <ChannelCover
                              tiles={tilesFromPosts(posts(c.covers))}
                              label={c.name}
                              className="absolute inset-0"
                            />
                          )}
                          <span className="absolute left-3 top-3 flex h-[30px] max-w-[calc(100%-24px)] items-center rounded-full bg-black/55 px-3 text-[13px] font-extrabold backdrop-blur-md">
                            <span className="truncate">{c.name}</span>
                          </span>
                        </Link>
                        <button
                          type="button"
                          disabled={keeping === c.slug}
                          onClick={() => void keep(c)}
                          aria-label={`Keep ${c.name} as one of your channels`}
                          // In the tile's corner: 22 − 12 = 10 px.
                          className="absolute bottom-3 right-3 flex h-8 items-center whitespace-nowrap rounded-[10px] bg-black/55 px-3 text-xs font-extrabold text-white backdrop-blur-md hover:bg-black/75 disabled:opacity-60"
                        >
                          Keep
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          <section
            id="nx-all"
            aria-labelledby="nx-mine"
            className="flex scroll-mt-24 flex-col gap-4"
          >
            <h2
              id="nx-mine"
              className="m-0 font-nx-serif text-[30px] font-normal leading-[0.95] md:text-[40px]"
            >
              Your channels
            </h2>
            {data && data.mine.length === 0 && (
              <p className="m-0 text-sm text-white/60">
                Save a post in the player and add it to a channel, or keep one of the channels made
                for you.
              </p>
            )}
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-4">
              {data?.mine.map((c) => {
                const page = data.username ? `/t/${data.username}/${c.tag}` : null
                return (
                  <li key={c.tag} className="flex min-w-0 flex-col gap-2">
                    <Link
                      href={
                        page ??
                        (data.username ? channelPlayHref(data.username, c.tag) : '/channels')
                      }
                      aria-label={`${channelTitle(c.tag)}, ${countLabel(c.count)}`}
                      className="block"
                    >
                      <ChannelCover
                        tiles={tilesFromPosts(posts(c.covers))}
                        label={channelTitle(c.tag)}
                        className="aspect-[5/4] w-full"
                      />
                    </Link>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] font-bold">{channelTitle(c.tag)}</span>
                      <span className="flex items-center gap-1 text-xs text-white/55">
                        {!c.isPublic && <Lock aria-hidden className="h-3 w-3" />}
                        <span>
                          {`${c.isPublic ? 'Public' : 'Private'} · ${countLabel(c.count)}${c.isPublic && c.viewCount ? ` · ${c.viewCount} views` : ''}`}
                        </span>
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
          <TopChannels className="w-full lg:max-w-[560px]" />
        </div>
      </main>
      <footer className="mx-auto flex max-w-[1600px] flex-wrap gap-x-4 gap-y-1 px-4 pb-10 text-[13px] text-nx-muted md:px-10">
        <Link href="/settings" className="underline hover:text-white">
          Settings
        </Link>
      </footer>
      {toast && (
        <div
          role="status"
          className={cn(
            'fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-black',
          )}
        >
          {toast}
        </div>
      )}
      {paste.toast}
      {learningOpen && (
        <LearningSheet status={learning.status} onClose={() => setLearningOpen(false)} />
      )}
    </div>
  )
}
