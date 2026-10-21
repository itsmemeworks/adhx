'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItem } from '@/components/feed/types'
import { NxAvatar } from '../primitives'
import { saverName } from '../savers'
import { reactedPlayHref } from '../theater/queue'
import { ROW, RowHeading } from './PeopleRows'
import { tilesFromPosts } from './ChannelParts'

/**
 * "Reactions" on Channels: the newest posts people reacted to (the ones you
 * can see), each with its last reaction's face and emoji, and Play all
 * (`/play?reacted=1`). Hidden when there are none, or when it didn't load.
 */

interface ReactedCard {
  post: FeedItem
  reactions: {
    count: number
    last: {
      emoji: string | null
      text: string | null
      at: string
      saver: { username: string; name: string | null; avatarUrl: string | null; isYou: boolean }
    }
  }
}

const SHOWN = 8

function postsLabel(n: number): string {
  return n === 1 ? '1 post with reactions' : `${n.toLocaleString('en-GB')} posts with reactions`
}

export function ReactionsRow() {
  const [data, setData] = useState<{ items: ReactedCard[]; total: number } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/posts/reacted?limit=${SHOWN}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: ReactedCard[]; total: number }>) : null))
      .then((body) => setData(body ? { items: body.items ?? [], total: body.total ?? 0 } : null))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  if (!data || data.items.length === 0) return null
  return (
    <section aria-labelledby="nx-reactions" className="flex flex-col gap-4">
      <RowHeading id="nx-reactions" title="Reactions" sub={postsLabel(data.total)}>
        <Link
          href={reactedPlayHref()}
          aria-label={`Play all ${postsLabel(data.total)}`}
          className="flex h-11 items-center gap-2 self-start whitespace-nowrap text-[15px] font-semibold text-nx-accent hover:text-nx-cream md:self-auto"
        >
          <Play aria-hidden className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
          <span>Play all</span>
        </Link>
      </RowHeading>
      <ul className={cn(ROW, 'md:grid-cols-4 xl:grid-cols-6')}>
        {data.items.map(({ post, reactions }) => {
          const key = `${post.platform ?? 'twitter'}:${post.id}`
          const tile = tilesFromPosts([post])[0]
          const { saver, emoji, text } = reactions.last
          const who = saverName({ ...saver, savedAt: reactions.last.at })
          const said = emoji ?? `“${text ?? ''}”`
          return (
            <li key={key} className="w-[150px] shrink-0 md:w-auto">
              <Link
                href={reactedPlayHref(key)}
                aria-label={`${who} reacted ${said}${reactions.count > 1 ? `, ${reactions.count} reactions` : ''}. Play from here.`}
                className="relative block h-[200px] overflow-hidden rounded-[20px] bg-nx-surface text-nx-cream md:h-[220px] md:rounded-[22px]"
              >
                {tile?.img ? (
                  <img
                    src={tile.img}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 overflow-hidden bg-nx-cream p-3 font-nx-serif text-[15px] leading-tight text-nx-ink">
                    {tile?.text?.slice(0, 140)}
                  </span>
                )}
                <span className="nx-scrim absolute inset-x-0 bottom-0 flex items-center gap-2 px-2.5 pb-2.5 pt-8">
                  <NxAvatar
                    author={{
                      avatarUrl: saver.avatarUrl,
                      handle: saver.username,
                      name: saver.name ?? saver.username,
                    }}
                    size={28}
                  />
                  <span
                    className={cn(
                      'nx-text-shadow min-w-0 truncate text-white',
                      emoji ? 'text-xl leading-none' : 'text-[13px] font-semibold',
                    )}
                  >
                    {emoji ?? text}
                  </span>
                  {reactions.count > 1 && (
                    <span className="nx-text-shadow ml-auto shrink-0 text-xs font-bold text-white/80">
                      {`+${reactions.count - 1}`}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
