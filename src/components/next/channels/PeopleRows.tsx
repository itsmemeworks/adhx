'use client'

import Link from 'next/link'
import { Play, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItem } from '@/components/feed/types'
import type { Saver } from '@/lib/people/types'
import { NxAvatar } from '../primitives'
import { SaverFaces } from '../SaverFaces'
import { friendChannelHref, orderedSavers, saverName, savesOf } from '../savers'
import { groupPlayHref } from '../theater/queue'
import { tilesFromPosts, type CoverTile } from './ChannelParts'

/**
 * The two rows at the top of Channels, for members:
 *
 * - **From everyone**: the server's saves grouped and named (group channels),
 *   each with who saved into it and how much is new to you.
 * - **Your people**: one channel per friend, plus "Invite someone".
 */

interface CoverItem {
  post: FeedItem
}

export interface GroupChannelCardData {
  slug: string
  name: string
  size: number
  members: number
  savers: Saver[]
  newCount: number
  covers: CoverItem[]
}

export interface FriendChannelCardData {
  username: string
  name: string | null
  avatarUrl: string | null
  size: number
  newCount: number
  covers: CoverItem[]
}

function savesLabel(n: number): string {
  return n === 1 ? '1 save' : `${n.toLocaleString('en-GB')} saves`
}

/** "3 of you", "Mum and you", "Jo and Ben", "Ana". */
export function whoSavedInto(members: number, savers: readonly Saver[]): string {
  const known = orderedSavers(savers)
  if (members > 2 || known.length < members) return `${members} of you`
  const names = [...known.filter((s) => !s.isYou), ...known.filter((s) => s.isYou)].map((s) =>
    s.isYou ? 'you' : saverName(s),
  )
  if (names.length === 0) return ''
  const line = names.join(' and ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

function NewPill({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'absolute flex h-6 items-center rounded-full bg-nx-accent px-2.5 text-xs font-extrabold text-black',
        className,
      )}
    >
      {`${count} new`}
    </span>
  )
}

function Tile({ tile, className }: { tile: CoverTile | undefined; className?: string }) {
  if (tile?.img) {
    return <img src={tile.img} alt="" className={cn('h-full w-full object-cover', className)} />
  }
  return (
    <span
      className={cn(
        'block h-full w-full overflow-hidden bg-nx-cream p-2 text-[11px] leading-tight text-nx-ink',
        className,
      )}
    >
      {tile?.text?.slice(0, 80)}
    </span>
  )
}

function RowHeading({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
      <h2 id={id} className="m-0 font-nx-serif text-[26px] font-normal md:text-[30px]">
        {title}
      </h2>
      <span className="text-[13px] text-white/55">{sub}</span>
    </div>
  )
}

const ROW =
  '-mx-4 flex list-none gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:overflow-visible md:px-0 md:gap-5 [&::-webkit-scrollbar]:hidden'

function Shimmer({ height }: { height: string }) {
  return (
    <div aria-hidden className="flex gap-3 overflow-hidden">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'nx-shimmer animate-nx-shimmer block w-[240px] shrink-0 rounded-[22px]',
            height,
          )}
        />
      ))}
    </div>
  )
}

/** "From everyone": rabbit holes made from the whole server's saves. */
export function FromEveryoneRow({ channels }: { channels: GroupChannelCardData[] | null }) {
  return (
    <section aria-labelledby="nx-everyone" className="flex flex-col gap-3">
      <RowHeading id="nx-everyone" title="From everyone" sub="Rabbit holes, dug by your friends" />
      {channels === null ? (
        <Shimmer height="h-[230px]" />
      ) : channels.length === 0 ? (
        <p className="m-0 text-sm text-white/60">
          These dig themselves once your lot has saved a few dozen things. Keep going.
        </p>
      ) : (
        <ul className={cn(ROW, 'md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4')}>
          {channels.map((c) => {
            const tiles = tilesFromPosts(c.covers.map((i) => i.post))
            const who = whoSavedInto(c.members, c.savers)
            return (
              <li key={c.slug} className="w-[240px] shrink-0 md:w-auto">
                <Link
                  href={groupPlayHref(c.slug)}
                  aria-label={`Play ${c.name}, ${savesLabel(c.size)}${who ? `, ${who}` : ''}${c.newCount ? `, ${c.newCount} new` : ''}`}
                  className="flex flex-col gap-2.5 text-nx-cream"
                >
                  <span className="relative grid h-[182px] grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-[22px] bg-nx-surface">
                    {[0, 1, 2, 3].map((i) => (
                      <Tile key={i} tile={tiles[i] ?? tiles[i % Math.max(1, tiles.length)]} />
                    ))}
                    <NewPill count={c.newCount} className="left-2.5 top-2.5" />
                    <span className="absolute bottom-2.5 right-2.5 flex h-7 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-extrabold text-white backdrop-blur-md">
                      <Play aria-hidden className="h-3 w-3" fill="currentColor" strokeWidth={0} />
                      <span>Play all</span>
                    </span>
                  </span>
                  <span className="truncate text-lg font-extrabold">{c.name}</span>
                  <span className="flex min-w-0 items-center gap-2.5 text-sm text-white/70">
                    {c.savers.length > 0 && (
                      <SaverFaces savers={c.savers} size={22} compact linked tone="scrim" />
                    )}
                    <span className="truncate">
                      {who ? `${savesLabel(c.size)} · ${who}` : savesLabel(c.size)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** "Your people": a channel per friend, and a card to invite someone. */
export function YourPeopleRow({
  friends,
  canInvite,
}: {
  friends: FriendChannelCardData[] | null
  canInvite: boolean
}) {
  return (
    <section aria-labelledby="nx-people" className="flex flex-col gap-3">
      <RowHeading
        id="nx-people"
        title="Your people"
        sub="One channel per friend. Everything they kept."
      />
      {friends === null ? (
        <Shimmer height="h-[158px]" />
      ) : (
        <>
          {friends.length === 0 && (
            <p className="m-0 text-sm text-white/60">
              {canInvite
                ? 'Just you so far. The feed gets better with company.'
                : 'Just you so far. When your people start saving, they show up here.'}
            </p>
          )}
          {(friends.length > 0 || canInvite) && (
            <ul className={cn(ROW, 'md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4')}>
              {friends.map((f) => {
                const tiles = tilesFromPosts(f.covers.map((i) => i.post))
                const title = savesOf({ ...f, isYou: false })
                return (
                  <li key={f.username} className="w-[248px] shrink-0 md:w-auto">
                    <Link
                      href={friendChannelHref(f.username)}
                      aria-label={`${title}, ${savesLabel(f.size)}${f.newCount ? `, ${f.newCount} new` : ''}`}
                      className="relative flex h-[158px] flex-col justify-between rounded-[24px] border border-white/[0.08] bg-nx-surface p-4 text-nx-cream"
                    >
                      <span
                        className={cn('flex min-w-0 items-center gap-3', f.newCount > 0 && 'pr-12')}
                      >
                        <NxAvatar
                          author={{
                            avatarUrl: f.avatarUrl,
                            handle: f.username,
                            name: f.name ?? f.username,
                          }}
                          size={64}
                          className={cn(
                            f.newCount > 0 &&
                              'shadow-[0_0_0_2px_rgb(var(--nx-surface)),0_0_0_4px_rgb(var(--nx-accent))]',
                          )}
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[17px] font-extrabold">{title}</span>
                          <span className="text-[13px] text-white/55">{savesLabel(f.size)}</span>
                        </span>
                      </span>
                      <span aria-hidden className="grid grid-cols-3 gap-1.5">
                        {[0, 1, 2].map((i) =>
                          tiles[i] ? (
                            <span key={i} className="block h-[50px] overflow-hidden rounded-xl">
                              <Tile tile={tiles[i]} />
                            </span>
                          ) : (
                            <span key={i} className="block h-[50px] rounded-xl bg-white/[0.04]" />
                          ),
                        )}
                      </span>
                      <NewPill count={f.newCount} className="right-3.5 top-3.5" />
                    </Link>
                  </li>
                )
              })}
              {canInvite && (
                <li className="w-[248px] shrink-0 md:w-auto">
                  <Link
                    href="/settings#invite"
                    className="flex h-[158px] flex-col items-center justify-center gap-2.5 rounded-[24px] border-[1.5px] border-dashed border-nx-accent/55 p-4 text-center"
                  >
                    <span
                      aria-hidden
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-nx-accent/15 text-nx-accent"
                    >
                      <Plus className="h-[22px] w-[22px]" />
                    </span>
                    <span className="text-base font-extrabold text-nx-accent">Invite someone</span>
                    <span className="text-[13px] text-white/55">
                      One link signs them in and pairs their phone
                    </span>
                  </Link>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
