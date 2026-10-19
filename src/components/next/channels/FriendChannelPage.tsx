'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronLeft, Lock, Play } from 'lucide-react'
import { resultKey, type SearchResultItem } from '../search/model'
import { Masonry } from '../search/ResultViews'
import { NxAvatar } from '../primitives'
import { savesOf } from '../savers'
import { friendPlayHref, recentPlayHref } from '../theater/queue'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { NxHeader } from './ChannelParts'

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
    return () => controller.abort()
  }, [username])

  const savesLabel = total === 1 ? '1 save' : `${total.toLocaleString('en-GB')} saves`

  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <NxHeader current="channels">
        <PasteButton onClick={paste.pasteFromClipboard} />
      </NxHeader>
      <main className="mx-auto flex max-w-[1600px] flex-col gap-7 px-4 pb-16 pt-2 md:px-7 lg:flex-row lg:items-start lg:gap-8">
        <aside
          aria-label="About this channel"
          className="flex flex-col lg:sticky lg:top-24 lg:w-[320px] lg:shrink-0"
        >
          <Link
            href="/channels"
            className="flex h-6 items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white"
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
            <span>All channels</span>
          </Link>
          <NxAvatar
            author={{ avatarUrl, handle: username, name: name ?? username }}
            size={112}
            className="mt-5 shadow-[0_0_0_6px_#000,0_0_0_8px_rgb(var(--nx-accent)/0.35)]"
          />
          <h1 className="m-0 mt-5 font-nx-serif text-[44px] font-normal leading-[0.95] md:text-[62px]">
            {title}
          </h1>
          <p className="m-0 mt-3 text-[17px] font-semibold text-white/75">
            <span>{savesLabel}</span>
            {newCount > 0 && (
              <>
                <span> · </span>
                <span className="text-nx-accent">{`${newCount} you haven’t seen`}</span>
              </>
            )}
          </p>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
            <Link
              href={friendPlayHref(username)}
              className="flex h-[52px] items-center justify-center gap-2.5 rounded-full sm:flex-1 lg:flex-none bg-nx-accent text-base font-extrabold text-black"
            >
              <Play aria-hidden className="h-4 w-4" fill="currentColor" strokeWidth={0} />
              <span>Play all</span>
            </Link>
            {newCount > 0 && (
              <Link
                href={friendPlayHref(username, { onlyNew: true })}
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-full sm:flex-1 lg:flex-none border border-white/[0.08] bg-white/[0.08] text-base font-extrabold text-nx-cream"
              >
                <span aria-hidden className="h-2 w-2 rounded-full bg-nx-accent" />
                <span>{newCount === 1 ? 'Play the new one' : `Play the ${newCount} new ones`}</span>
              </Link>
            )}
          </div>
          <p className="m-0 mt-6 flex items-center gap-2 text-[13px] text-white/55">
            <Lock aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span>Only people on this server can see this page.</span>
          </p>
        </aside>
        <section aria-label={title} className="min-w-0 flex-1">
          {items === null ? (
            <div aria-hidden className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="nx-shimmer animate-nx-shimmer block h-[220px] rounded-[14px] md:h-[300px]"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="m-0 text-white/65">
              {failed
                ? 'Their saves didn’t load. Refresh to try again.'
                : 'Nothing here yet. Whatever they keep for the group shows up here.'}
            </p>
          ) : (
            <Masonry
              items={items}
              columns="columns-2 md:columns-3 2xl:columns-4"
              hrefFor={(item) => friendPlayHref(username, { start: resultKey(item) })}
              showStrength={false}
            />
          )}
        </section>
      </main>
      {paste.toast}
    </div>
  )
}
