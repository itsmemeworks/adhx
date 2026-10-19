'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import { Gob } from './Gob'
import { NetworkIcon } from './NetworkIcon'
import { ALL_PLATFORMS } from './networks'
import { cn } from './cn'
import { Art, type ArtId } from './art'
import s from './reel.module.css'

/**
 * The product site's hero: a ~30 second reel of what ADHX does, played as
 * live markup (sharp at any size, nothing to download). Each scene restarts
 * its CSS animations when it comes on. `/showreel/` shows it alone, which is
 * what the MP4 is recorded from.
 */

const W = 1280
const H = 720

const at = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` })

function Typed({ text, start, step = 55 }: { text: string; start: number; step?: number }) {
  return (
    <span>
      {Array.from(text).map((c, i) => (
        <span key={i} className={s.char} style={at(start + i * step)}>
          {c}
        </span>
      ))}
      <span className={s.caret} />
    </span>
  )
}

function Tile({
  art,
  className,
  style,
  children,
}: {
  art: ArtId
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-[18px] bg-[#1a1814]', className)}
      style={style}
    >
      <Art id={art} className="absolute inset-0 h-full w-full" />
      {children}
    </div>
  )
}

function Caption({ kicker, title, sub }: { kicker: string; title: ReactNode; sub?: string }) {
  return (
    <div className="absolute bottom-[56px] left-[64px] flex max-w-[560px] flex-col gap-3">
      <span
        className={cn(
          s.fade,
          'text-[15px] font-extrabold uppercase tracking-[0.16em] text-[#ffd23f]',
        )}
      >
        {kicker}
      </span>
      <span className={cn(s.serif, s.rise, 'text-[64px] leading-[0.95]')} style={at(80)}>
        {title}
      </span>
      {sub && (
        <span className={cn(s.rise, 'text-[20px] leading-snug text-[#c9bfab]')} style={at(220)}>
          {sub}
        </span>
      )}
    </div>
  )
}

/* ——— Scenes ——— */

function Networks() {
  return (
    <>
      <div className="absolute left-[64px] top-[150px] flex flex-col">
        <span className={cn(s.serif, s.slam, 'text-[132px] leading-[0.9]')}>Every post</span>
        <span
          className={cn(s.serif, s.slam, 'text-[132px] leading-[0.9] text-[#ffd23f]')}
          style={at(260)}
        >
          you love.
        </span>
        <span className={cn(s.rise, 'mt-8 text-[22px] text-[#c9bfab]')} style={at(600)}>
          From fourteen networks, in one place.
        </span>
      </div>
      <div className="absolute right-[64px] top-[120px] grid grid-cols-4 gap-4">
        {ALL_PLATFORMS.map((p, i) => (
          <div
            key={p}
            className={cn(
              s.pop,
              'flex h-[96px] w-[96px] items-center justify-center rounded-[26px] bg-[#1a1814]',
            )}
            style={at(300 + i * 90)}
          >
            <NetworkIcon platform={p} className="h-[40px] w-[40px] text-white" />
          </div>
        ))}
      </div>
    </>
  )
}

function Save() {
  return (
    <>
      <div className="absolute left-1/2 top-[110px] w-[860px] -translate-x-1/2">
        <div
          className={cn(
            s.rise,
            'flex h-[84px] items-center gap-4 rounded-full border-2 border-[#ffd23f] bg-[#0f0e0c] px-8 text-[28px]',
          )}
        >
          <span className="font-extrabold text-[#ffd23f]">Paste</span>
          <span className="text-[#c9bfab]">
            <Typed text="youtube.com/shorts/frog-in-the-rain" start={350} step={38} />
          </span>
        </div>
      </div>
      <div className={cn(s.grabbing, 'absolute left-[140px] top-[300px] flex items-center gap-5')}>
        <Gob size={120} mood="busy" />
        <span className={cn(s.serif, 'text-[54px]')}>Grabbing it…</span>
      </div>
      <Tile
        art="frogRain"
        className={cn(s.dropIn, 'absolute right-[150px] top-[230px] h-[400px] w-[300px]')}
        style={at(2350)}
      >
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[14px] font-bold">
          <NetworkIcon platform="youtube" className="h-4 w-4" />
          <span>YouTube</span>
        </div>
      </Tile>
      <div
        className={cn(
          s.rise,
          'absolute left-[140px] top-[330px] flex items-center gap-4 rounded-[22px] bg-[#1a1814] px-6 py-5',
        )}
        style={at(2750)}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ffd23f] text-black">
          <svg
            aria-hidden
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="flex flex-col">
          <span className="text-[30px] font-extrabold">Saved</span>
          <span className="text-[18px] text-[#c9bfab]">Keeping your own copy · 4K</span>
        </span>
      </div>
    </>
  )
}

function Keep() {
  const files = [
    { name: 'video-1.mp4', meta: '3840 × 2160 · from X', art: 'city' as ArtId },
    { name: 'photo-1.jpg', meta: 'Full size · from Instagram', art: 'peaks' as ArtId },
    { name: 'audio-1.m4a', meta: 'The track · from SoundCloud', art: 'synth' as ArtId },
  ]
  return (
    <>
      <div className="absolute left-[64px] top-[90px] flex flex-col">
        <span className={cn(s.serif, s.slam, 'text-[110px] leading-[0.92]')}>Kept.</span>
        <span
          className={cn(s.serif, s.slam, 'text-[110px] leading-[0.92] text-[#ffd23f]')}
          style={at(240)}
        >
          In the original.
        </span>
      </div>
      <div className="absolute left-[64px] top-[380px] flex flex-col gap-3">
        {files.map((f, i) => (
          <div
            key={f.name}
            className={cn(
              s.slideL,
              'flex w-[560px] items-center gap-4 rounded-[18px] bg-[#1a1814] p-3',
            )}
            style={at(600 + i * 260)}
          >
            <Tile art={f.art} className="h-[64px] w-[64px] rounded-[12px]" />
            <span className="flex flex-col">
              <span className="font-mono text-[20px]">{f.name}</span>
              <span className="text-[16px] text-[#c9bfab]">{f.meta}</span>
            </span>
          </div>
        ))}
      </div>
      <div
        className={cn(
          s.pop,
          'absolute right-[90px] top-[150px] flex h-[420px] w-[420px] flex-col items-center justify-center gap-4 rounded-[48px] bg-[#1a1814]',
        )}
        style={at(900)}
      >
        <span className={cn(s.serif, s.pulse, 'text-[180px] leading-none text-[#ffd23f]')}>4K</span>
        <span className="px-10 text-center text-[22px] leading-snug text-[#c9bfab]">
          Downloaded once, served from your own disk, plays in every browser.
        </span>
      </div>
    </>
  )
}

function Search() {
  const results: Array<{ art: ArtId; chip?: string }> = [
    { art: 'frog', chip: 'Strong · in the video' },
    { art: 'frogRain', chip: 'Strong · in the picture' },
    { art: 'wave' },
    { art: 'peaks' },
    { art: 'cat' },
  ]
  return (
    <>
      <div className="absolute left-1/2 top-[56px] w-[900px] -translate-x-1/2">
        <div
          className={cn(
            s.rise,
            'flex h-[76px] items-center gap-4 rounded-full bg-[#1a1814] px-8 text-[30px]',
          )}
        >
          <svg
            aria-hidden
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffd23f"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <Typed text="a frog in a pond" start={250} step={60} />
        </div>
      </div>
      <div className="absolute left-[64px] right-[64px] top-[170px] grid grid-cols-5 gap-4">
        {results.map((r, i) => (
          <Tile
            key={r.art}
            art={r.art}
            className={cn(s.pop, 'h-[300px]', i === 0 && 'ring-4 ring-[#ffd23f]')}
            style={at(1400 + i * 120)}
          >
            {r.chip && (
              <span className="absolute bottom-3 left-3 right-3 rounded-full bg-[#ffd23f] px-3 py-1.5 text-center text-[14px] font-extrabold text-black">
                {r.chip}
              </span>
            )}
          </Tile>
        ))}
      </div>
      <div
        className={cn(s.fade, 'absolute left-[640px] top-[500px] flex flex-col gap-2')}
        style={at(2300)}
      >
        <span className="text-[15px] font-bold uppercase tracking-[0.14em] text-[#a89f8d]">
          A frame every 2 seconds
        </span>
        <div className="relative flex gap-2 overflow-hidden rounded-[12px]">
          {(['frog', 'frog', 'frogRain', 'frog', 'frogRain', 'frog'] as ArtId[]).map((a, i) => (
            <Tile key={i} art={a} className="h-[86px] w-[96px] rounded-[10px]" />
          ))}
          <span
            className={cn(
              s.scan,
              'absolute bottom-0 top-0 w-[6px] rounded bg-[#ffd23f] shadow-[0_0_24px_#ffd23f]',
            )}
          />
        </div>
      </div>
      <Caption
        kicker="Search by meaning"
        title={<span>Describe it. Find it.</span>}
        sub="EmbeddingGemma 2 reads the words, the pictures and the video, on your own server."
      />
    </>
  )
}

function RightNow() {
  const moments: Array<{ art: ArtId; name: string; n: number }> = [
    { art: 'frogRain', name: 'Frogs in the rain', n: 4 },
    { art: 'synth', name: 'Synth jams', n: 3 },
    { art: 'skate', name: 'Skate tricks', n: 2 },
  ]
  return (
    <>
      <div className="absolute left-[64px] top-[70px] flex items-center gap-4">
        <span className={cn(s.live, 'h-5 w-5 rounded-full bg-[#ff5c39]')} />
        <span className={cn(s.serif, s.slam, 'text-[96px] leading-none')}>Right now</span>
      </div>
      <div className="absolute left-[64px] right-[64px] top-[210px] grid grid-cols-3 gap-6">
        {moments.map((m, i) => (
          <div key={m.name} className={cn(s.rise, 'flex flex-col gap-3')} style={at(350 + i * 200)}>
            <Tile art={m.art} className={cn('h-[300px]', i === 0 && s.pulse)}>
              <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[15px] font-bold">
                <span className={cn(s.live, 'h-2.5 w-2.5 rounded-full bg-[#ff5c39]')} />
                <span>{`${m.n} people saving`}</span>
              </span>
            </Tile>
            <div className="flex items-center justify-between">
              <span className="text-[24px] font-extrabold">{m.name}</span>
              {i === 0 && (
                <span
                  className={cn(
                    s.pop,
                    'rounded-full bg-[#ffd23f] px-5 py-2 text-[18px] font-extrabold text-black',
                  )}
                  style={at(1500)}
                >
                  Tune in
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div
        className={cn(s.rise, 'absolute bottom-[50px] left-[64px] text-[24px] text-[#c9bfab]')}
        style={at(1100)}
      >
        What everyone on your ADHX is saving, as it happens. Tune in and watch together.
      </div>
    </>
  )
}

function Channels() {
  const channels: Array<{ name: string; arts: ArtId[] }> = [
    { name: 'Frogs in the rain', arts: ['frog', 'frogRain', 'wave', 'frog'] },
    { name: 'Synth jams', arts: ['synth', 'neon', 'city', 'synth'] },
    { name: 'Food you’ll cook one day', arts: ['steak', 'peaks', 'steak', 'cat'] },
  ]
  return (
    <>
      <div className="absolute left-[64px] top-[70px] flex flex-col">
        <span
          className={cn(
            s.fade,
            'text-[15px] font-extrabold uppercase tracking-[0.16em] text-[#ffd23f]',
          )}
        >
          Channels
        </span>
        <span className={cn(s.serif, s.slam, 'text-[92px] leading-none')} style={at(120)}>
          Made for you.
        </span>
      </div>
      <div className="absolute left-[64px] right-[64px] top-[250px] grid grid-cols-3 gap-6">
        {channels.map((c, ci) => (
          <div key={c.name} className="flex flex-col gap-3">
            <div className="grid h-[320px] grid-cols-2 gap-2">
              {c.arts.map((a, i) => (
                <Tile
                  key={i}
                  art={a}
                  className={cn(s.pop, 'rounded-[14px]')}
                  style={at(300 + ci * 220 + i * 90)}
                />
              ))}
            </div>
            <span className={cn(s.rise, 'text-[24px] font-extrabold')} style={at(900 + ci * 200)}>
              {c.name}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function Phone({
  net,
  art,
  label,
  delay,
  className,
}: {
  net: string
  art: ArtId
  label: string
  delay: number
  className?: string
}) {
  return (
    <div
      className={cn(
        s.rise,
        'relative h-[560px] w-[270px] overflow-hidden rounded-[44px] border-[6px] border-[#2a2620] bg-black',
        className,
      )}
      style={at(delay)}
    >
      <Art id={art} className="absolute inset-0 h-full w-full opacity-40" />
      <div
        className={cn(
          s.rise,
          'absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-[26px] bg-[#1a1814] p-4',
        )}
        style={at(delay + 600)}
      >
        <span className="mx-auto h-1 w-9 rounded bg-[#4a453c]" />
        <span className="flex items-center gap-2">
          <Gob size={26} />
          <span className={cn(s.serif, 'text-[24px] leading-none')}>adhx</span>
        </span>
        <span className="flex items-center gap-2 text-[14px] font-bold text-[#c9bfab]">
          <NetworkIcon platform={net} className="h-4 w-4 text-white" />
          <span>{label}</span>
        </span>
        <span className="flex items-center gap-2 rounded-[14px] bg-black px-3 py-3 text-[16px] font-extrabold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ffd23f] text-black">
            <svg
              aria-hidden
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span>Saved to your ADHX</span>
        </span>
      </div>
    </div>
  )
}

function Phones() {
  return (
    <>
      <div className="absolute left-[64px] top-[120px] flex max-w-[520px] flex-col gap-5">
        <span
          className={cn(
            s.fade,
            'text-[15px] font-extrabold uppercase tracking-[0.16em] text-[#ffd23f]',
          )}
        >
          iPhone and Android
        </span>
        <span className={cn(s.serif, s.slam, 'text-[92px] leading-[0.95]')} style={at(120)}>
          Share from any app.
        </span>
        <span className={cn(s.rise, 'text-[24px] leading-snug text-[#c9bfab]')} style={at(500)}>
          The companion apps put ADHX in your share menu. One tap and it’s yours.
        </span>
      </div>
      <Phone
        net="tiktok"
        art="skate"
        label="TikTok"
        delay={300}
        className="absolute right-[360px] top-[80px]"
      />
      <Phone
        net="instagram"
        art="cat"
        label="Instagram"
        delay={650}
        className="absolute right-[64px] top-[110px] rotate-[4deg]"
      />
    </>
  )
}

function Finale() {
  return (
    <>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <div className={cn(s.pop, 'flex items-center gap-6')}>
          <Gob size={190} mood="busy" />
          <span className={cn(s.serif, 'text-[170px] leading-none')}>adhx</span>
        </div>
        <span
          className={cn(s.serif, s.rise, 'text-[64px] leading-none text-[#ffd23f]')}
          style={at(450)}
        >
          Self-hosted. Yours.
        </span>
        <span
          className={cn(
            s.rise,
            'rounded-full border-2 border-[#f2ead9] px-7 py-3 font-mono text-[24px] text-[#f2ead9]',
          )}
          style={at(800)}
        >
          github.com/itsmemeworks/adhx
        </span>
      </div>
      <div className={cn(s.flash, 'absolute inset-0 bg-[#ffd23f]')} />
    </>
  )
}

const SCENES: Array<{ id: string; ms: number; render: () => ReactNode }> = [
  { id: 'networks', ms: 3300, render: Networks },
  { id: 'save', ms: 4300, render: Save },
  { id: 'keep', ms: 3800, render: Keep },
  { id: 'search', ms: 4800, render: Search },
  { id: 'now', ms: 3800, render: RightNow },
  { id: 'channels', ms: 3500, render: Channels },
  { id: 'phones', ms: 3800, render: Phones },
  { id: 'finale', ms: 4200, render: Finale },
]

export const REEL_MS = SCENES.reduce((n, sc) => n + sc.ms, 0)

export function HeroReel({
  className,
  controls = true,
  bare = false,
}: {
  className?: string
  controls?: boolean
  /** No rounded frame (the recording). */
  bare?: boolean
}) {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const [index, setIndex] = useState(0)
  const [loop, setLoop] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const fit = () => setScale(el.clientWidth / W)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false)
  }, [])

  useEffect(() => {
    if (!playing) return
    const t = window.setTimeout(() => {
      setIndex((i) => {
        if (i === SCENES.length - 1) {
          setLoop((l) => l + 1)
          return 0
        }
        return i + 1
      })
    }, SCENES[index].ms)
    return () => window.clearTimeout(t)
  }, [index, playing])

  const scene = SCENES[index]
  return (
    <div className={cn('relative', className)}>
      <div
        ref={frame}
        className={cn(s.frame, bare && s.bare)}
        role="img"
        aria-label="ADHX in thirty seconds: save posts from fourteen networks, keep the originals, search them by meaning, watch what friends save, share from your phone, run it yourself."
      >
        <div
          className={s.stage}
          style={{
            transform: `scale(${scale})`,
            height: H,
            visibility: scale ? 'visible' : 'hidden',
          }}
        >
          <div
            key={`${loop}-${scene.id}`}
            className={s.scene}
            style={playing ? undefined : { animationPlayState: 'paused' }}
          >
            {scene.render()}
            <span
              className={s.progress}
              style={{
                animationDuration: `${scene.ms}ms`,
                animationPlayState: playing ? 'running' : 'paused',
              }}
            />
          </div>
        </div>
      </div>
      {controls && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause the reel' : 'Play the reel'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-nx-surface text-white"
          >
            {playing ? (
              <Pause aria-hidden className="h-4 w-4" />
            ) : (
              <Play aria-hidden className="h-4 w-4" />
            )}
          </button>
          {SCENES.map((sc, i) => (
            <button
              key={sc.id}
              type="button"
              aria-label={`Show part ${i + 1}`}
              aria-current={i === index}
              onClick={() => {
                setIndex(i)
                setLoop((l) => l + 1)
              }}
              className="flex h-11 w-6 items-center justify-center"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-all',
                  i === index ? 'w-6 bg-nx-accent' : 'w-1.5 bg-white/30',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const REEL_SIZE = { width: W, height: H }
