'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { networkLabel } from '@/lib/platform/networks'
import { ChevronLeft, Lock, Play } from 'lucide-react'
import { kindOf, resultKey, type SearchResultItem } from '../search/model'
import { Masonry } from '../search/ResultViews'
import { NxAvatar } from '../primitives'
import { savesOf } from '../savers'
import { friendPlayHref, recentPlayHref } from '../theater/queue'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { personColour } from '../moments/people'
import { NxHeader } from './ChannelParts'

type Show = 'all' | 'videos' | 'photos' | 'music' | 'posts'

const SHOW_LABEL: Record<Show, string> = {
  all: 'All',
  videos: 'Videos',
  photos: 'Photos',
  music: 'Music',
  posts: 'Posts',
}

/** Which filter a post falls under (SoundCloud is music, whatever its media). */
function showOf(item: SearchResultItem): Exclude<Show, 'all'> {
  if ((item.post.platform as string | undefined) === 'soundcloud') return 'music'
  const kind = kindOf(item)
  if (kind === 'video' || kind === 'gif') return 'videos'
  if (kind === 'photo') return 'photos'
  return 'posts'
}

/** "Mostly YouTube, X and SoundCloud." from the networks they save from most. */
function mostlyFrom(items: SearchResultItem[]): string | null {
  if (items.length < 3) return null
  const counts = new Map<string, number>()
  for (const i of items) {
    const n = networkLabel(i.post.platform)
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n]) => n)
  const list = top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0]
  return `Mostly ${list}.`
}

/**
 * A friend's channel (`/channels/friend/{username}`): their face, how many
 * saves and how many you haven't seen, Play all, Play the new ones, and
 * every post they kept for the group. Members only (never their private
 * saves); the page says so.
 */
export function FriendChannelPage({
  username,
  name,
  avatarUrl,
  size,
}: {
  username: string
  name: string | null
  avatarUrl: string | null
  size: number
}) {
  const [items, setItems] = useState<SearchResultItem[] | null>(null)
  const [total, setTotal] = useState(size)
  const [newCount, setNewCount] = useState(0)
  const [failed, setFailed] = useState(false)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [show, setShow] = useState<Show>('all')
  const title = savesOf({ name, username, isYou: false })
  const paste = usePasteToSave({
    savedAction: (post) => ({
      label: 'Play',
      onClick: () => window.location.assign(recentPlayHref(post.key)),
    }),
  })

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/channels/friend/${encodeURIComponent(username)}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              items: SearchResultItem[]
              friend?: { size: number; newCount: number }
            }>)
          : Promise.reject(new Error('load')),
      )
      .then((d) => {
        setItems(d.items)
        if (d.friend) {
          setTotal(d.friend.size)
          setNewCount(d.friend.newCount)
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFailed(true)
        setItems([])
      })
    // Which of them you haven't seen yet, for the "New" marks.
    fetch(`/api/channels/friend/${encodeURIComponent(username)}?new=1`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: SearchResultItem[] }>) : null))
      .then((d) => d && setFresh(new Set(d.items.map(resultKey))))
      .catch(() => {})
    return () => controller.abort()
  }, [username])

  const counts = useMemo(() => {
    const c: Record<Show, number> = { all: 0, videos: 0, photos: 0, music: 0, posts: 0 }
    for (const i of items ?? []) {
      c.all++
      c[showOf(i)]++
    }
    return c
  }, [items])
  const shown = useMemo(
    () => (show === 'all' ? items : items?.filter((i) => showOf(i) === show)) ?? null,
    [items, show],
  )
  const mostly = useMemo(() => mostlyFrom(items ?? []), [items])
  const ring = personColour(username)

  const savesLabel = total === 1 ? '1 save' : `${total.toLocaleString('en-GB')} saves`

  return (
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-nx-cream">
      <NxHeader current="channels">
        {/* Desktop pastes anywhere on the page (⌘V); phones need the button. */}
        <PasteButton onClick={paste.pasteFromClipboard} className="md:hidden" />
      </NxHeader>
      <main className="mx-auto flex max-w-[1600px] flex-col gap-7 px-4 pb-16 pt-5 md:px-8 md:pt-7 lg:flex-row lg:items-start lg:gap-8">
        <aside
          aria-label="About this channel"
          className="flex flex-col lg:sticky lg:top-[100px] lg:min-h-[calc(100dvh-128px)] lg:w-[320px] lg:shrink-0"
        >
          <Link
            href="/channels"
            className="flex h-6 items-center gap-1.5 text-sm font-semibold text-nx-soft hover:text-nx-cream"
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
            <span>All channels</span>
          </Link>
          <NxAvatar
            author={{ avatarUrl, handle: username, name: name ?? username }}
            size={112}
            className="mt-[22px]"
            style={{ boxShadow: `0 0 0 6px #0f0e0c, 0 0 0 8px ${ring}59` }}
          />
          <h1 className="m-0 mt-[22px] whitespace-nowrap font-nx-serif text-[44px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[62px]">
            {title}
          </h1>
          <p className="m-0 mt-3 text-[17px] font-semibold text-nx-soft">
            <span>{savesLabel}</span>
            {newCount > 0 && (
              <>
                <span> · </span>
                <span className="text-nx-accent">{`${newCount} you haven’t seen`}</span>
              </>
            )}
          </p>
          <p className="m-0 mt-2 text-sm leading-normal text-nx-muted">
            {mostly
              ? `${mostly} Picked by hand, one at a time, like it’s 2009.`
              : 'Picked by hand, one at a time, like it’s 2009.'}
          </p>
          <div className="mt-[22px] flex flex-col gap-2.5 sm:flex-row lg:flex-col">
            <Link
              href={friendPlayHref(username)}
              className="flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-nx-accent text-base font-extrabold text-black sm:flex-1 lg:flex-none"
            >
              <Play aria-hidden className="h-4 w-4" fill="currentColor" strokeWidth={0} />
              <span>Play all</span>
            </Link>
            {newCount > 0 && (
              <Link
                href={friendPlayHref(username, { onlyNew: true })}
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-full border border-white/[0.08] bg-[#262320] text-base font-extrabold text-nx-cream sm:flex-1 lg:flex-none"
              >
                <span aria-hidden className="h-2 w-2 rounded-full bg-nx-accent" />
                <span>{newCount === 1 ? 'Play the new one' : `Play the ${newCount} new ones`}</span>
              </Link>
            )}
          </div>
          {counts.all > 0 && (
            <div role="group" aria-label="Show" className="mt-[22px] flex flex-wrap gap-1.5">
              {(Object.keys(SHOW_LABEL) as Show[])
                .filter((k) => k === 'all' || counts[k] > 0)
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={show === k}
                    onClick={() => setShow(k)}
                    className={cn(
                      'h-9 whitespace-nowrap rounded-full px-3.5 text-[13px]',
                      show === k
                        ? 'bg-nx-cream font-extrabold text-black'
                        : 'bg-nx-surface font-semibold text-nx-cream',
                    )}
                  >
                    {k === 'all' ? SHOW_LABEL[k] : `${SHOW_LABEL[k]} ${counts[k]}`}
                  </button>
                ))}
            </div>
          )}
          <p className="m-0 mt-6 flex items-center gap-2 text-[13px] text-nx-muted lg:mt-auto lg:pt-6">
            <Lock aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span>Only people on this server can see this page.</span>
          </p>
        </aside>
        <section aria-label={title} className="min-w-0 flex-1">
          {shown === null ? (
            <div
              aria-hidden
              className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3.5 xl:grid-cols-4"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="nx-shimmer animate-nx-shimmer block h-[220px] rounded-[14px] md:h-[300px]"
                />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="m-0 text-white/65">
              {failed
                ? 'Their saves didn’t load. Refresh to try again.'
                : 'Nothing here yet. Whatever they keep for the group shows up here.'}
            </p>
          ) : (
            <Masonry
              items={shown}
              columns="columns-2 md:columns-3 xl:columns-4"
              hrefFor={(item) => friendPlayHref(username, { start: resultKey(item) })}
              showStrength={false}
              owner={username}
              isNew={(item) => fresh.has(resultKey(item))}
            />
          )}
        </section>
      </main>
      {paste.toast}
    </div>
  )
}
