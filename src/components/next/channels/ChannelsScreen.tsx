'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Lock, Play, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItem } from '@/components/feed/types'
import { autoPlayHref, channelPlayHref, recentPlayHref } from '../theater/queue'
import { LearningPill, LearningSheet, useLearningStatus } from '../onboarding/learning'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { ChannelCover, NxHeader, TopChannels, channelTitle, tilesFromPosts } from './ChannelParts'

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
        body: JSON.stringify({ isPublic: true }),
      })
      if (!res.ok) throw new Error('keep')
      flash(`“${channel.name}” is now one of your channels, and it’s public`)
      load()
    } catch {
      flash('Couldn’t keep that channel. Try again.')
    } finally {
      setKeeping(null)
    }
  }

  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <NxHeader>
        <h1 className="m-0 hidden font-nx-serif text-2xl font-normal text-white/70 md:block">
          Channels
        </h1>
        <span className="flex-1" />
        <LearningPill status={learning.status} onOpen={() => setLearningOpen(true)} />
        <PasteButton onClick={paste.pasteFromClipboard} />
      </NxHeader>
      <main className="mx-auto flex max-w-[1600px] flex-col gap-7 px-4 pb-16 pt-2 md:px-7 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-9">
          <h1 className="m-0 font-nx-serif text-[36px] font-normal leading-none md:hidden">
            Channels
          </h1>
          {error && (
            <p className="m-0 text-white/70">Channels didn’t load. Refresh to try again.</p>
          )}

          <section aria-labelledby="nx-mfy" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
              <h2
                id="nx-mfy"
                className="m-0 flex items-center gap-2 font-nx-serif text-[26px] font-normal md:text-[30px]"
              >
                <Sparkles
                  aria-hidden
                  className="h-5 w-5 text-nx-accent"
                  fill="currentColor"
                  strokeWidth={1.5}
                />
                <span>Made for you</span>
              </h2>
              <span className="text-[13px] text-white/55">
                Your saves, grouped by what they’re about. Only you see these.
              </span>
            </div>
            {data === null && !error ? (
              <div aria-hidden className="flex gap-3 overflow-hidden">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="nx-shimmer animate-nx-shimmer block h-[260px] w-[240px] shrink-0 rounded-[18px]"
                  />
                ))}
              </div>
            ) : data && data.madeForYou.length === 0 ? (
              <p className="m-0 text-sm text-white/60">
                These appear once enough of your saves are understood. Keep saving, they’ll show up
                here.
              </p>
            ) : (
              <ul className="-mx-4 flex list-none gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
                {data?.madeForYou.map((c) => (
                  <li key={c.slug} className="flex w-[220px] shrink-0 flex-col gap-2 md:w-[240px]">
                    <Link
                      href={autoPlayHref(c.slug)}
                      aria-label={`Play ${c.name}`}
                      className="block"
                    >
                      <ChannelCover
                        tiles={tilesFromPosts(posts(c.covers))}
                        label={c.name}
                        className="h-[200px] w-full"
                      />
                    </Link>
                    <span className="flex flex-col">
                      <span className="truncate text-base font-bold">{c.name}</span>
                      <span className="text-xs text-white/55">{countLabel(c.size)}</span>
                    </span>
                    <span className="flex gap-2">
                      <Link
                        href={autoPlayHref(c.slug)}
                        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-nx-accent text-sm font-extrabold text-black"
                      >
                        <Play
                          aria-hidden
                          className="h-3.5 w-3.5"
                          fill="currentColor"
                          strokeWidth={0}
                        />
                        <span>Play</span>
                      </Link>
                      <button
                        type="button"
                        disabled={keeping === c.slug}
                        onClick={() => void keep(c)}
                        className="h-10 flex-1 rounded-full border border-white/40 text-sm font-bold disabled:opacity-60"
                      >
                        Keep
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="nx-mine" className="flex flex-col gap-3">
            <h2 id="nx-mine" className="m-0 font-nx-serif text-[26px] font-normal md:text-[30px]">
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
        </div>
        <TopChannels className="w-full lg:sticky lg:top-24 lg:w-[400px] lg:shrink-0" />
      </main>
      <footer className="mx-auto flex max-w-[1600px] flex-wrap gap-x-4 gap-y-1 px-4 pb-10 text-[13px] text-white/50 md:px-7">
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
