import type { ReactNode } from 'react'
import { cn } from './cn'
import { NetworkIcon } from './NetworkIcon'
import { ALL_PLATFORMS, networkLabel } from './networks'
import { Face, PEOPLE, type PersonId } from './People'
import { Credit, PostMedia } from './Post'
import { Arrow } from './icons'
import { Kicker, WRAP } from './ProductSite'

/**
 * What ADHX is, in one picture: the big public networks on the left, your
 * people picking from them in the middle, one private feed on the right.
 * Then the parts that make it a social network (and the one part it leaves
 * out).
 */

const PICKERS: Array<{ who: PersonId; from: (typeof ALL_PLATFORMS)[number] }> = [
  { who: 'ana', from: 'tiktok' },
  { who: 'ben', from: 'twitter' },
  { who: 'mum', from: 'facebook' },
  { who: 'jo', from: 'youtube' },
]

const PARTS = [
  'A feed that plays',
  'A page for every friend',
  'Reactions',
  'Channels',
  'Live, watching together',
  'Send to a friend',
  'Invite links',
]

function Stage({
  n,
  title,
  sub,
  children,
  className,
}: {
  n: string
  title: string
  sub: string
  children: ReactNode
  className?: string
}) {
  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-[22px] border border-white/10 bg-nx-surface p-4 md:p-5',
        className,
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[12px] font-extrabold text-nx-accent">{n}</span>
        <span className="text-[17px] font-extrabold leading-tight md:text-[19px]">{title}</span>
        <span className="text-[13px] leading-snug text-nx-muted md:text-[14px]">{sub}</span>
      </span>
      {children}
    </li>
  )
}

function Join() {
  return (
    <li aria-hidden className="flex items-center justify-center text-nx-accent">
      <Arrow size={22} className="rotate-90 lg:rotate-0" />
    </li>
  )
}

export function Friends() {
  return (
    <section
      id="friends"
      aria-labelledby="friends-title"
      className="scroll-mt-16 border-y border-white/10 bg-black py-10 md:py-16"
    >
      <div className={cn(WRAP, 'flex flex-col gap-6 md:gap-10')}>
        <div className="flex flex-col gap-2.5 md:gap-4 xl:flex-row xl:items-end xl:justify-between xl:gap-12">
          <div className="flex flex-col gap-2.5 md:gap-3.5">
            <Kicker>Friends only</Kicker>
            <h2
              id="friends-title"
              className="m-0 font-nx-serif text-[36px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[56px] lg:text-[60px]"
            >
              <span className="block">A whole social network.</span>
              <span className="block text-nx-accent">Population: your friends.</span>
            </h2>
          </div>
          <p className="m-0 max-w-[560px] text-[15px] leading-[1.45] text-nx-soft md:text-[18px] md:leading-[1.55]">
            The big networks are built for strangers and advertisers. ADHX keeps the good part: your
            people find the best of all of them and share it with each other, in one place nobody
            else can get into.
          </p>
        </div>

        <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 lg:grid-cols-[minmax(0,1.35fr)_32px_minmax(0,1fr)_32px_minmax(0,1fr)] lg:gap-3">
          <Stage n="01" title="Fourteen networks" sub="Billions of posts. Mostly not for you.">
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {ALL_PLATFORMS.map((p) => (
                <li
                  key={p}
                  className="flex h-[30px] items-center gap-1.5 rounded-full border border-white/10 bg-black/40 pl-1 pr-2.5"
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-[#262320]">
                    <NetworkIcon platform={p} className="h-3 w-3 text-white" />
                  </span>
                  <span className="whitespace-nowrap text-[12px] font-semibold md:text-[13px]">
                    {networkLabel(p)}
                  </span>
                </li>
              ))}
            </ul>
          </Stage>
          <Join />
          <Stage n="02" title="Your people pick" sub="They hit share on the good ones. That’s it.">
            <ul className="m-0 grid list-none grid-cols-2 gap-1.5 p-0 lg:grid-cols-1">
              {PICKERS.map(({ who, from }) => (
                <li
                  key={who}
                  className="flex min-w-0 items-center gap-2 rounded-[14px] bg-black/40 py-1 pl-1 pr-2.5"
                >
                  <Face who={who} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold">
                    {PEOPLE[who].name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[12px] text-nx-muted">
                    <NetworkIcon platform={from} className="h-3 w-3" />
                    <span className="hidden sm:inline">{networkLabel(from)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Stage>
          <Join />
          <Stage
            n="03"
            title="One feed, just yours"
            sub="Full screen, faces on, nobody else invited."
          >
            <div className="relative aspect-[16/10] overflow-hidden rounded-[14px] bg-black">
              <PostMedia id="offbeat" className="absolute inset-0 h-full w-full" />
              <span className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.85))]" />
              <span className="absolute bottom-2 left-2 flex items-center gap-1.5">
                <Face who="ana" size={22} ring="#000" />
                <Face who="ben" size={22} ring="#000" className="-ml-3" />
                <span className="text-[12px] font-extrabold text-white">
                  Ana and Ben saved this
                </span>
              </span>
              <Credit id="offbeat" chip className="absolute right-2 top-2" />
            </div>
          </Stage>
        </ol>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
          <p className="m-0 shrink-0 text-[13px] font-extrabold uppercase tracking-[0.14em] text-nx-muted">
            Everything a social network has
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 md:gap-2">
            {PARTS.map((t) => (
              <li
                key={t}
                className="whitespace-nowrap rounded-full border border-white/10 bg-nx-surface px-3 py-1.5 text-[13px] font-semibold md:text-[14px]"
              >
                {t}
              </li>
            ))}
            <li className="whitespace-nowrap rounded-full border border-dashed border-white/20 px-3 py-1.5 text-[13px] font-semibold text-nx-muted line-through decoration-nx-accent decoration-2 md:text-[14px]">
              Strangers
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
