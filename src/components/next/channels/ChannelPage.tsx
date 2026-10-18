'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bookmark, Globe, Link2, Lock, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItem } from '@/components/feed/types'
import { postCoverSrc } from '../post'
import { resultKey, type SearchResultItem } from '../search/model'
import { Masonry } from '../search/ResultViews'
import { channelPlayHref, recentPlayHref } from '../theater/queue'
import { startHref } from '@/lib/next-ui/routes'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { ChannelCover, NxHeader, TopChannels, channelTitle, tilesFromPosts } from './ChannelParts'
import { useSiteHost } from '@/lib/routes/use-host'

/**
 * A channel's page (`/t/{username}/{tag}`):
 * collage hero, Play, Save channel (copies it into your saves), the public
 * link, and its posts. Anyone can open a public channel.
 */
export function ChannelPage({
  username,
  tag,
  count,
  mine,
  signedIn,
}: {
  username: string
  tag: string
  count: number
  mine: boolean
  signedIn: boolean
}) {
  const host = useSiteHost()
  const [items, setItems] = useState<SearchResultItem[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  // From the posts API (the page's own count is 0 for a private channel).
  const [isPublic, setIsPublic] = useState<boolean | null>(null)
  const [total, setTotal] = useState(count)
  const [visibility, setVisibility] = useState<'idle' | 'saving' | 'error'>('idle')
  const path = `/t/${username}/${tag}`
  const paste = usePasteToSave({
    savedAction: (post) => ({
      label: 'Play',
      onClick: () => window.location.assign(recentPlayHref(post.key)),
    }),
  })

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/channels/by/${encodeURIComponent(username)}/${encodeURIComponent(tag)}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              items: SearchResultItem[]
              channel?: { count: number; isPublic: boolean }
            }>)
          : { items: [] as SearchResultItem[], channel: undefined },
      )
      .then((d) => {
        setItems(d.items)
        if (d.channel) {
          setIsPublic(d.channel.isPublic)
          setTotal(d.channel.count)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([])
      })
    return () => controller.abort()
  }, [username, tag])

  const posts: FeedItem[] = (items ?? []).map((i) => i.post)
  const heroImage = posts.map(postCoverSrc).find(Boolean) ?? null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the link is visible on the button to copy by hand.
    }
  }

  // Owners: make the channel public or private again.
  const setPublic = async (next: boolean) => {
    const before = isPublic
    setIsPublic(next)
    setVisibility('saving')
    try {
      const res = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, isPublic: next }),
      })
      if (!res.ok) throw new Error('visibility')
      setVisibility('idle')
    } catch {
      setIsPublic(before)
      setVisibility('error')
    }
  }

  const saveChannel = async () => {
    setSaved('saving')
    try {
      const res = await fetch(
        `/api/share/tag/by-name/${encodeURIComponent(username)}/${encodeURIComponent(tag)}/clone`,
        { method: 'POST' },
      )
      setSaved(res.ok ? 'done' : 'error')
    } catch {
      setSaved('error')
    }
  }

  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <NxHeader>{signedIn && <PasteButton onClick={paste.pasteFromClipboard} />}</NxHeader>
      <main className="mx-auto flex max-w-[1600px] flex-col gap-7 px-0 pb-16 md:px-7 lg:flex-row lg:items-start">
        <section aria-label="Channel" className="flex min-w-0 flex-1 flex-col gap-4 md:gap-[18px]">
          <div className="relative h-[430px] overflow-hidden md:h-[340px] md:rounded-[22px]">
            {heroImage && (
              <img
                src={heroImage}
                alt=""
                aria-hidden
                className="absolute -inset-14 h-[calc(100%+112px)] w-[calc(100%+112px)] object-cover blur-[40px] brightness-[0.55] saturate-[1.2]"
              />
            )}
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30 md:bg-gradient-to-r md:from-black/75 md:via-black/25 md:to-transparent"
            />
            <ChannelCover
              tiles={tilesFromPosts(posts.slice(0, 3))}
              label={channelTitle(tag)}
              className="absolute right-6 top-8 hidden h-[270px] w-[360px] bg-transparent md:block"
            />
            <div className="nx-text-shadow absolute inset-x-[18px] bottom-[18px] flex flex-col gap-2.5 md:inset-y-8 md:left-8 md:right-[46%]">
              <span className="text-xs font-extrabold uppercase tracking-[1.4px] text-nx-accent">
                Channel
              </span>
              <h1 className="m-0 font-nx-serif text-[44px] font-normal leading-none md:text-[60px] md:leading-[0.95]">
                {channelTitle(tag)}
              </h1>
              <span className="flex items-center gap-2 text-[15px]">
                <span
                  aria-hidden
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-nx-accent text-xs font-extrabold text-black [text-shadow:none]"
                >
                  {username.charAt(0).toUpperCase()}
                </span>
                <span>{`@${username} · ${total === 1 ? '1 post' : `${total} posts`}${mine && isPublic === false ? ' · Private' : ''}`}</span>
              </span>
              <span className="mt-2 hidden flex-wrap gap-2.5 [text-shadow:none] md:mt-auto md:flex">
                <PlayButton username={username} tag={tag} />
                {!mine && (
                  <SaveChannelButton
                    signedIn={signedIn}
                    path={path}
                    state={saved}
                    onSave={() => void saveChannel()}
                  />
                )}
                {isPublic !== false && (
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className="flex h-[50px] items-center gap-2 rounded-full bg-white/15 px-[18px] text-sm font-semibold"
                  >
                    <Link2 aria-hidden className="h-4 w-4" />
                    <span>{copied ? 'Copied' : `${host}${path}`}</span>
                  </button>
                )}
                {mine && isPublic !== null && (
                  <VisibilityToggle
                    isPublic={isPublic}
                    busy={visibility === 'saving'}
                    onChange={(next) => void setPublic(next)}
                  />
                )}
              </span>
              {mine && visibility === 'error' && (
                <span role="alert" className="text-sm text-[#ff8a7a] [text-shadow:none]">
                  Couldn’t change that. Try again.
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2.5 px-[18px] md:hidden">
            <PlayButton username={username} tag={tag} className="flex-1 justify-center" />
            {!mine && (
              <SaveChannelButton
                signedIn={signedIn}
                path={path}
                state={saved}
                onSave={() => void saveChannel()}
                className="flex-1 justify-center"
              />
            )}
            {isPublic !== false && (
              <button
                type="button"
                aria-label={copied ? 'Link copied' : 'Copy link'}
                onClick={() => void copy()}
                className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-white/15"
              >
                <Link2 aria-hidden className="h-5 w-5" />
              </button>
            )}
            {mine && isPublic !== null && (
              <VisibilityToggle
                isPublic={isPublic}
                busy={visibility === 'saving'}
                onChange={(next) => void setPublic(next)}
                compact
              />
            )}
          </div>
          <div className="px-1 md:px-0">
            {items === null ? (
              <div aria-hidden className="grid grid-cols-2 gap-1 md:grid-cols-4 md:gap-2.5">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="nx-shimmer animate-nx-shimmer block h-[172px] md:h-[300px] md:rounded-[14px]"
                  />
                ))}
              </div>
            ) : (
              <Masonry
                items={items}
                columns="columns-2 md:columns-3 xl:columns-4"
                hrefFor={(item) => channelPlayHref(username, tag, resultKey(item))}
                showStrength={false}
              />
            )}
          </div>
        </section>
        <TopChannels
          highlight={`${username}/${tag}`}
          className="mx-4 lg:sticky lg:top-24 lg:mx-0 lg:w-[400px] lg:shrink-0"
        />
      </main>
      {paste.toast}
    </div>
  )
}

function PlayButton({
  username,
  tag,
  className,
}: {
  username: string
  tag: string
  className?: string
}) {
  return (
    <Link
      href={channelPlayHref(username, tag)}
      className={`flex h-[50px] items-center gap-2 rounded-full bg-nx-accent px-[22px] text-base font-extrabold text-black md:h-[50px] ${className ?? ''}`}
    >
      <Play aria-hidden className="h-4 w-4" fill="currentColor" strokeWidth={0} />
      <span>Play</span>
    </Link>
  )
}

function SaveChannelButton({
  signedIn,
  path,
  state,
  onSave,
  className,
}: {
  signedIn: boolean
  /** This channel's address, to come back to after signing in. */
  path: string
  state: 'idle' | 'saving' | 'done' | 'error'
  onSave: () => void
  className?: string
}) {
  const base = `flex h-[50px] items-center gap-2 rounded-full border-[1.5px] border-white bg-black/30 px-5 text-[15px] font-bold ${className ?? ''}`
  if (!signedIn) {
    return (
      <Link href={startHref(path)} className={base}>
        <Bookmark aria-hidden className="h-4 w-4" />
        <span>Sign in to save</span>
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={state === 'saving' || state === 'done'}
      className={base}
    >
      <Bookmark aria-hidden className="h-4 w-4" fill={state === 'done' ? 'currentColor' : 'none'} />
      <span>
        {state === 'done'
          ? 'Saved to your channels'
          : state === 'error'
            ? 'Try again'
            : 'Save channel'}
      </span>
    </button>
  )
}

/** Owner only: Public (anyone with the link) or Private (only you). */
function VisibilityToggle({
  isPublic,
  busy,
  onChange,
  compact = false,
}: {
  isPublic: boolean
  busy: boolean
  onChange: (isPublic: boolean) => void
  compact?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Who can see this channel"
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full bg-white/15 p-1 [text-shadow:none]',
        compact ? 'h-[52px]' : 'h-[50px]',
      )}
    >
      {[
        { on: isPublic, value: true, label: 'Public', Icon: Globe },
        { on: !isPublic, value: false, label: 'Private', Icon: Lock },
      ].map(({ on, value, label, Icon }) => (
        <button
          key={label}
          type="button"
          aria-pressed={on}
          disabled={busy}
          onClick={() => !on && onChange(value)}
          className={cn(
            'flex h-full items-center gap-1.5 rounded-full px-3.5 text-sm font-bold disabled:opacity-70',
            on ? 'bg-nx-cream text-black' : 'text-white/80',
          )}
        >
          <Icon aria-hidden className="h-4 w-4" />
          <span className={compact ? 'sr-only' : undefined}>{label}</span>
        </button>
      ))}
    </div>
  )
}
