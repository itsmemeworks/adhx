import type { CSSProperties, ReactNode } from 'react'
import { cn } from './cn'
import { Gob } from './Gob'
import { Face, Faces, type PersonId } from './People'
import { NetworkIcon } from './NetworkIcon'
import { Credit, PostMedia, post as postEntry, type PostId } from './Post'
import { Bookmark, Check, Close, Dots, List, Lock, Search, Smile, Video } from './icons'

/**
 * Device mockups that scale with their frame. Each frame is a size container
 * (`.nx-scale`); inside, `--u` is one pixel of the original 390-wide phone or
 * 594-wide laptop screen, so a mockup keeps its proportions at any width.
 */

/** `n` design pixels, in the nearest frame's units. */
export const u = (n: number) => `calc(var(--u) * ${n})`

const unitOf = (designWidth: number) =>
  ({ '--u': `calc(100cqw / ${designWidth})` }) as CSSProperties

/* ——— Phone ——— */

export function PhoneFrame({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[13%/6%] border-[4px] border-[#2a2620] bg-black shadow-[0_32px_80px_rgba(0,0,0,0.7)] md:border-[6px]',
        className,
      )}
      style={style}
    >
      <div className="nx-scale relative aspect-[390/844] w-full">
        <div className="absolute inset-0 overflow-hidden" style={unitOf(390)}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** The phone app's top bar: Gob, Home · Channels · Live, search. */
function PhoneTopBar({ newCount }: { newCount: number }) {
  return (
    <div
      className="absolute inset-x-0 flex items-center"
      style={{ top: u(44), height: u(52), padding: `0 ${u(16)}`, gap: u(10) }}
    >
      <span style={{ width: u(32), height: u(32) }}>
        <Gob size={32} className="h-full w-full" />
      </span>
      <span className="flex-1" />
      <span
        className="flex rounded-full bg-black/50"
        style={{ gap: u(2), padding: u(4), fontSize: u(15) }}
      >
        <span
          className="relative flex items-center whitespace-nowrap rounded-full bg-nx-cream font-extrabold text-black"
          style={{ height: u(40), padding: `0 ${u(16)}` }}
        >
          <span>Home</span>
          <span
            className="absolute flex items-center justify-center rounded-full bg-nx-accent font-extrabold text-black"
            style={{
              right: u(-8),
              top: u(-9),
              minWidth: u(20),
              height: u(20),
              padding: `0 ${u(5)}`,
              fontSize: u(11),
              boxShadow: `0 0 0 ${u(2)} #000`,
            }}
          >
            {newCount}
          </span>
        </span>
        <span
          className="flex items-center whitespace-nowrap font-semibold text-nx-cream"
          style={{ height: u(40), padding: `0 ${u(14)}` }}
        >
          Channels
        </span>
        <span
          className="flex items-center whitespace-nowrap font-semibold text-nx-cream"
          style={{ height: u(40), padding: `0 ${u(14)}`, gap: u(6) }}
        >
          <span className="rounded-full bg-[#ff5a3c]" style={{ width: u(7), height: u(7) }} />
          <span>Live</span>
        </span>
      </span>
      <span className="flex-1" />
      <span
        className="flex items-center justify-center rounded-full bg-black/45 text-nx-cream"
        style={{ width: u(44), height: u(44) }}
      >
        <Search size={u(20)} />
      </span>
    </div>
  )
}

/** The rail on the right of the phone player: React, Save, Share, the network, More. */
function PhoneRail({ saved, network }: { saved: boolean; network: string }) {
  const button = (icon: ReactNode, on = false) => (
    <span
      className={cn(
        'flex items-center justify-center rounded-full bg-black/45',
        on ? 'text-nx-accent' : 'text-nx-cream',
      )}
      style={{ width: u(52), height: u(52) }}
    >
      {icon}
    </span>
  )
  return (
    <div className="absolute flex flex-col" style={{ right: u(12), bottom: u(92), gap: u(10) }}>
      {button(<Smile size={u(24)} />)}
      {button(<Bookmark size={u(22)} />, saved)}
      {button(<Video size={u(22)} />)}
      {button(<NetworkIcon platform={network} className="h-[1.4em] w-[1.4em]" />)}
      {button(<Dots size={u(22)} />)}
    </div>
  )
}

/**
 * The phone app's player (layout C): the post, the rail, and one row along
 * the bottom with the first saver's face, the line and where you are. A wide
 * video sits letterboxed over a blurred copy of itself, as in the app.
 */
export function PlayerScreen({
  post,
  savers,
  newCount,
  count,
  saved = false,
  progress = 0.4,
  reason,
}: {
  post: PostId
  /** Who saved it, first saver first. */
  savers: PersonId[]
  newCount: number
  /** Where you are: "2 of 6". */
  count: string
  saved?: boolean
  progress?: number
  /** The one reason faces can't say: "Ana sent you this". */
  reason?: ReactNode
}) {
  const [first] = savers
  const more = savers.length - 1
  return (
    <div className="absolute inset-0 text-white" style={{ fontSize: u(15) }}>
      <PostMedia id={post} fit="contain" className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent"
        style={{ height: u(220) }}
      />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: u(320),
          background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.92))',
        }}
      />
      <PhoneTopBar newCount={newCount} />
      {reason && (
        <span
          className="absolute flex items-center whitespace-nowrap rounded-full border border-white/15 bg-black/55 font-bold text-nx-cream"
          style={{
            left: u(16),
            bottom: u(92),
            height: u(40),
            padding: `0 ${u(14)} 0 ${u(10)}`,
            gap: u(8),
            fontSize: u(14),
          }}
        >
          {reason}
        </span>
      )}
      <PhoneRail saved={saved} network={postEntry(post).network} />
      <div
        className="absolute flex items-center"
        style={{ left: u(16), right: u(16), bottom: u(30), height: u(44), gap: u(12) }}
      >
        {first && (
          <span
            className="relative flex shrink-0 items-center justify-center"
            style={{ width: u(44), height: u(44) }}
          >
            <Face who={first} size={u(34)} ring="#000" />
            {more > 0 && (
              <span
                className="absolute flex items-center justify-center rounded-full bg-nx-cream font-extrabold text-black"
                style={{
                  right: u(-2),
                  bottom: u(0),
                  minWidth: u(18),
                  height: u(18),
                  padding: `0 ${u(4)}`,
                  fontSize: u(10),
                  boxShadow: '0 0 0 2px #000',
                }}
              >
                {`+${more}`}
              </span>
            )}
          </span>
        )}
        <span className="relative flex-1 rounded-full bg-white/25" style={{ height: u(4) }}>
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-nx-cream"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
          <span
            className="absolute rounded-full bg-nx-cream shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
            style={{
              left: `calc(${Math.round(progress * 100)}% - ${u(7)})`,
              top: u(-5),
              width: u(14),
              height: u(14),
            }}
          />
        </span>
        <span
          className="flex shrink-0 items-center whitespace-nowrap rounded-full border border-white/15 bg-black/55 font-extrabold text-nx-cream"
          style={{ height: u(36), padding: `0 ${u(10)}`, gap: u(6), fontSize: u(13) }}
        >
          <List size={u(14)} className="text-nx-accent" />
          <span>{count}</span>
        </span>
      </div>
    </div>
  )
}

/** A progress ring with the percentage inside. */
export function Ring({
  size,
  value,
  stroke = 5,
  fill = 'none',
  label,
  labelSize,
}: {
  size: number | string
  value: number
  stroke?: number
  fill?: string
  label: string
  labelSize: number | string
}) {
  const r = 26 - stroke / 2 - 2
  const c = 2 * Math.PI * r
  return (
    <span
      className="relative block shrink-0"
      style={{
        width: typeof size === 'number' ? size : size,
        height: typeof size === 'number' ? size : size,
      }}
    >
      <svg aria-hidden viewBox="0 0 52 52" className="block h-full w-full -rotate-90">
        <circle
          cx="26"
          cy="26"
          r={r}
          fill={fill}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="rgb(var(--nx-accent))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * value} ${c}`}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-extrabold"
        style={{ fontSize: labelSize }}
      >
        {label}
      </span>
    </span>
  )
}

/** A Just for me switch, off. */
export function Toggle({ width, height }: { width: number | string; height: number | string }) {
  return (
    <span className="relative shrink-0 rounded-full bg-[#3a3630]" style={{ width, height }}>
      <span
        className="absolute rounded-full bg-nx-soft"
        style={{
          left: '11%',
          top: '12%',
          height: '76%',
          aspectRatio: '1',
        }}
      />
    </span>
  )
}

/** The phone's share card: saving a post from another app. */
export function ShareCardScreen() {
  return (
    <div className="absolute inset-0 text-nx-cream" style={{ fontSize: u(17) }}>
      <PostMedia
        id="sorcerer"
        className="absolute h-[110%] w-[110%]"
        style={{ left: '-5%', top: '-5%', filter: 'blur(14px) brightness(0.45)' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col bg-nx-surface"
        style={{
          height: u(500),
          padding: `${u(12)} ${u(20)} ${u(34)}`,
          borderRadius: `${u(28)} ${u(28)} 0 0`,
          gap: u(16),
        }}
      >
        <span className="self-center rounded bg-[#4a453c]" style={{ width: u(40), height: u(5) }} />
        <span className="flex items-center" style={{ gap: u(12) }}>
          <span style={{ width: u(40), height: u(40) }}>
            <Gob size={40} className="h-full w-full" />
          </span>
          <span className="flex flex-1 flex-col" style={{ gap: u(2) }}>
            <span className="whitespace-nowrap font-extrabold" style={{ fontSize: u(19) }}>
              Save to your ADHX
            </span>
            <span className="whitespace-nowrap text-nx-muted" style={{ fontSize: u(14) }}>
              From another app
            </span>
          </span>
          <span
            className="flex items-center justify-center rounded-full bg-[#262320]"
            style={{ width: u(44), height: u(44) }}
          >
            <Close size={u(18)} />
          </span>
        </span>
        <span
          className="flex items-center bg-black"
          style={{ gap: u(14), padding: u(10), borderRadius: u(20) }}
        >
          <span
            className="relative shrink-0 overflow-hidden"
            style={{ width: u(64), height: u(64), borderRadius: u(14) }}
          >
            <PostMedia id="sorcerer" className="absolute inset-0 h-full w-full" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: u(3) }}>
            <Credit id="sorcerer" className="font-extrabold" style={{ fontSize: u(16) }} />
            <span className="whitespace-nowrap text-nx-muted" style={{ fontSize: u(14) }}>
              4 photos · full size
            </span>
          </span>
          <Ring size={u(52)} value={0.4} label="40%" labelSize={u(13)} />
        </span>
        <span className="whitespace-nowrap font-extrabold text-nx-soft" style={{ fontSize: u(15) }}>
          Keeping a copy on your box…
        </span>
        <span className="flex items-center" style={{ gap: u(12) }}>
          <Faces who={['ana', 'ben', 'mum', 'jo']} size={u(30)} ring="#1a1814" />
          <span className="whitespace-nowrap font-semibold" style={{ fontSize: u(16) }}>
            Shared with your people
          </span>
        </span>
        <span
          className="flex items-center bg-[#262320]"
          style={{ gap: u(12), padding: `${u(14)} ${u(16)}`, borderRadius: u(20) }}
        >
          <Lock size={u(22)} className="shrink-0 text-nx-soft" />
          <span className="flex-1 whitespace-nowrap font-extrabold">Just for me</span>
          <Toggle width={u(52)} height={u(32)} />
        </span>
        <span className="flex-1" />
        <span
          className="flex items-center justify-center rounded-full bg-nx-accent font-extrabold text-black"
          style={{ height: u(52) }}
        >
          Done
        </span>
      </div>
    </div>
  )
}

/* ——— Laptop ——— */

/** ADHX on the web, on a laptop: header, then the theater playing a post. */
export function WebFrame({ className }: { className?: string }) {
  const pill = (label: ReactNode, active = false) => (
    <span
      className={cn(
        'flex items-center whitespace-nowrap rounded-full',
        active ? 'bg-nx-accent font-extrabold text-black' : 'font-semibold text-nx-cream',
      )}
      style={{ height: u(24), padding: `0 ${u(10)}`, gap: u(5) }}
    >
      {label}
    </span>
  )
  return (
    <div className={cn('nx-scale', className)}>
      <div style={unitOf(620)}>
        <div
          className="border border-white/10 bg-nx-surface shadow-[0_40px_90px_rgba(0,0,0,0.6)]"
          style={{ padding: u(12), borderRadius: u(22) }}
        >
          <div
            className="relative flex aspect-[594/366] flex-col overflow-hidden bg-black"
            style={{ borderRadius: u(12) }}
          >
            {/* Header */}
            <div
              className="flex shrink-0 items-center border-b border-white/10 bg-nx-ink"
              style={{ height: u(40), padding: `0 ${u(12)}`, gap: u(14), fontSize: u(11) }}
            >
              <span className="flex items-center" style={{ gap: u(6) }}>
                <span style={{ width: u(20), height: u(20) }}>
                  <Gob size={20} className="h-full w-full" />
                </span>
                <span className="font-nx-serif leading-none" style={{ fontSize: u(18) }}>
                  adhx
                </span>
              </span>
              <span className="flex" style={{ gap: u(2) }}>
                {pill('Home', true)}
                {pill(
                  <>
                    <span
                      className="rounded-full bg-[#ff5a3c]"
                      style={{ width: u(5), height: u(5) }}
                    />
                    <span>Right now</span>
                  </>,
                )}
                {pill('Channels')}
                {pill('My saves')}
              </span>
              <span className="flex-1" />
              <span
                className="flex items-center whitespace-nowrap rounded-full bg-nx-surface text-nx-muted"
                style={{ height: u(24), padding: `0 ${u(10)}`, gap: u(6), fontSize: u(10) }}
              >
                <Search size={u(10)} />
                <span>Search everyone’s saves</span>
              </span>
              <Face who="you" size={u(24)} />
            </div>
            {/* The theater */}
            <div className="relative flex-1">
              <PostMedia id="offbeat" className="absolute inset-0 h-full w-full" />
              <div
                className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-b from-transparent to-black/90"
                style={{ padding: `${u(40)} ${u(16)} ${u(14)}`, gap: u(5) }}
              >
                <div className="flex items-center" style={{ gap: u(8) }}>
                  <Faces who={['you', 'ana']} size={u(22)} />
                  <span className="whitespace-nowrap font-extrabold" style={{ fontSize: u(12) }}>
                    You, Ana and 2 others saved this
                  </span>
                  <span className="whitespace-nowrap text-nx-soft" style={{ fontSize: u(11) }}>
                    · 3h
                  </span>
                </div>
                <span
                  className="flex items-center whitespace-nowrap text-nx-soft"
                  style={{ fontSize: u(11), gap: u(6) }}
                >
                  <Credit id="offbeat" className="font-bold text-nx-cream" />
                  <span>·</span>
                  <span
                    className="flex items-center font-bold text-nx-accent"
                    style={{ gap: u(4) }}
                  >
                    <Check size={u(11)} />
                    <span>Saved together</span>
                  </span>
                </span>
                <div className="flex items-center" style={{ gap: u(8), marginTop: u(4) }}>
                  <span className="font-semibold" style={{ fontSize: u(10) }}>
                    0:13
                  </span>
                  <span className="relative flex-1 rounded bg-white/25" style={{ height: u(3) }}>
                    <span className="block h-full w-[17%] rounded bg-nx-accent" />
                  </span>
                  <span className="font-semibold text-nx-soft" style={{ fontSize: u(10) }}>
                    1:15
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          className="relative bg-gradient-to-b from-[#34302a] to-nx-surface shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
          style={{
            width: '109.7%',
            marginLeft: '-4.85%',
            height: u(14),
            borderRadius: `${u(2)} ${u(2)} ${u(16)} ${u(16)}`,
          }}
        >
          <span
            className="absolute left-1/2 top-0 -translate-x-1/2 bg-[#12110f]"
            style={{ width: u(96), height: u(5), borderRadius: `0 0 ${u(6)} ${u(6)}` }}
          />
        </div>
      </div>
    </div>
  )
}
