import type { ReactNode } from 'react'
import { Gob } from '@/components/next/Gob'
import { NetworkIcon } from '@/components/next/NetworkIcon'
import { ALL_PLATFORMS, networkLabel } from '@/lib/platform/networks'
import { cn } from '@/lib/utils'
import { Art, type ArtId } from './art'
import { CopyCommand } from './CopyCommand'
import { HeroReel } from './HeroReel'

/**
 * adhx.com: the product site (ADHX_PRODUCT_SITE=1). What ADHX does, shown in
 * its own design with illustrated posts, and how to run your own.
 */

export const GITHUB_URL = 'https://github.com/itsmemeworks/adhx'

const SETUP = `git clone https://github.com/itsmemeworks/adhx && cd adhx
export SESSION_SECRET=$(openssl rand -base64 32)
export NEXT_PUBLIC_APP_URL=https://adhx.your-domain.example
export ALLOWED_EMAILS='you@example.com, @your-friends.example'
export EMAIL_LINKS_TO_ADMIN=1
docker compose up -d`

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  )
}

function Section({
  id,
  kicker,
  title,
  body,
  children,
  flip = false,
}: {
  id: string
  kicker: string
  title: ReactNode
  body: ReactNode
  children: ReactNode
  flip?: boolean
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-16 md:grid-cols-2 md:gap-16 md:px-8 md:py-24"
    >
      <div className={cn('flex flex-col gap-5', flip && 'md:order-2')}>
        <span className="text-[13px] font-extrabold uppercase tracking-[0.16em] text-nx-accent">
          {kicker}
        </span>
        <h2
          id={`${id}-title`}
          className="m-0 font-nx-serif text-[44px] font-normal leading-[0.98] md:text-[60px]"
        >
          {title}
        </h2>
        <div className="flex flex-col gap-4 text-[17px] leading-relaxed text-nx-soft md:text-[18px]">
          {body}
        </div>
      </div>
      <div className={cn(flip && 'md:order-1')}>{children}</div>
    </section>
  )
}

function Post({
  art,
  className,
  children,
}: {
  art: ArtId
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-[18px] bg-nx-surface', className)}>
      <Art id={art} className="absolute inset-0 h-full w-full" />
      {children}
    </div>
  )
}

function Chip({ children, tone = 'plate' }: { children: ReactNode; tone?: 'plate' | 'accent' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-extrabold',
        tone === 'accent' ? 'bg-nx-accent text-black' : 'bg-black/60 text-white',
      )}
    >
      {children}
    </span>
  )
}

/* ——— Feature mockups ——— */

function SearchMock() {
  const results: Array<{ art: ArtId; chip: string; on: string }> = [
    { art: 'frog', chip: 'Strong match', on: 'in the video' },
    { art: 'frogRain', chip: 'Strong match', on: 'in the picture' },
    { art: 'wave', chip: 'Related', on: 'in the words' },
  ]
  return (
    <div className="flex flex-col gap-4 rounded-[28px] bg-nx-surface p-4 md:p-5">
      <div className="flex h-14 items-center gap-3 rounded-full bg-black px-5 text-[17px]">
        <svg
          aria-hidden
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgb(var(--nx-accent))"
          strokeWidth="2.6"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <span>a frog in a pond</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {results.map((r, i) => (
          <div key={r.art} className="flex flex-col gap-2">
            <Post
              art={r.art}
              className={cn('aspect-[3/4]', i === 0 && 'ring-[3px] ring-nx-accent')}
            />
            <span className="flex flex-col">
              <span
                className={cn(
                  'text-[13px] font-extrabold',
                  i < 2 ? 'text-nx-accent' : 'text-nx-soft',
                )}
              >
                {r.chip}
              </span>
              <span className="text-[12px] text-nx-muted">{r.on}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-[18px] bg-black p-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-nx-muted">
          What it saw · a frame every 2 seconds
        </span>
        <div className="grid grid-cols-6 gap-1.5">
          {(['frog', 'frog', 'frogRain', 'frog', 'frogRain', 'frog'] as ArtId[]).map((a, i) => (
            <Post key={i} art={a} className="aspect-square rounded-[8px]" />
          ))}
        </div>
      </div>
    </div>
  )
}

function KeepMock() {
  const rows: Array<{ net: string; art: ArtId; name: string; detail: string }> = [
    { net: 'twitter', art: 'city', name: 'video-1.mp4', detail: '3840 × 2160 · 57 s · 39 MB' },
    { net: 'facebook', art: 'peaks', name: 'video-1.mp4', detail: '1920 × 1080 · 40 s · 15 MB' },
    {
      net: 'instagram',
      art: 'cat',
      name: 'photo-1.jpg … photo-4.jpg',
      detail: 'Full-size carousel',
    },
    { net: 'soundcloud', art: 'synth', name: 'audio-1.m4a', detail: 'The track and its artwork' },
  ]
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-nx-surface p-4 md:p-5">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[13px] text-nx-muted">/data/media</span>
        <Chip tone="accent">Kept on your disk</Chip>
      </div>
      {rows.map((r) => (
        <div key={r.name + r.net} className="flex items-center gap-3 rounded-[16px] bg-black p-2.5">
          <Post art={r.art} className="h-14 w-14 shrink-0 rounded-[12px]" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-mono text-[14px]">{r.name}</span>
            <span className="text-[13px] text-nx-muted">{r.detail}</span>
          </span>
          <NetworkIcon platform={r.net} className="h-5 w-5 text-white" />
        </div>
      ))}
    </div>
  )
}

function TheaterMock() {
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[340px] overflow-hidden rounded-[36px] border-[6px] border-[#2a2620] bg-black">
      <Art id="skate" className="absolute inset-0 h-full w-full" />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-3">
        {[
          <NetworkIcon key="n" platform="tiktok" className="h-[18px] w-[18px]" />,
          <svg
            key="s"
            aria-hidden
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="rgb(var(--nx-accent))"
          >
            <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
          </svg>,
          <svg key="b" aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
          </svg>,
          <svg
            key="d"
            aria-hidden
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
          </svg>,
        ].map((icon, i) => (
          <span
            key={i}
            className="nx-plate flex h-11 w-11 items-center justify-center rounded-full text-white"
          >
            {icon}
          </span>
        ))}
      </div>
      <div className="nx-scrim absolute inset-x-0 bottom-0 flex flex-col gap-2 px-4 pb-5 pt-16">
        <span className="flex items-center gap-2 text-[14px] font-bold">
          <span>@skatepark.daily</span>
          <Chip tone="accent">Just saved</Chip>
        </span>
        <span className="text-[13px] leading-snug text-white/85">
          First try on the big ramp, no way
        </span>
        <span className="h-1 overflow-hidden rounded bg-white/25">
          <span className="block h-1 w-2/3 rounded bg-nx-accent" />
        </span>
      </div>
    </div>
  )
}

function NowMock() {
  const moments: Array<{ art: ArtId; name: string; n: number }> = [
    { art: 'frogRain', name: 'Frogs in the rain', n: 4 },
    { art: 'synth', name: 'Synth jams', n: 3 },
  ]
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-nx-surface p-4 md:p-5">
      <span className="flex items-center gap-2 px-1 text-[15px] font-extrabold">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ff5c39]" />
        <span>Right now on your ADHX</span>
      </span>
      <div className="grid grid-cols-2 gap-3">
        {moments.map((m, i) => (
          <div key={m.name} className="flex flex-col gap-2">
            <Post art={m.art} className="aspect-[4/5]">
              <span className="absolute left-2 top-2">
                <Chip>{`${m.n} people saving`}</Chip>
              </span>
            </Post>
            <span className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-extrabold">{m.name}</span>
              {i === 0 && (
                <span className="rounded-full bg-nx-accent px-3 py-1 text-[13px] font-extrabold text-black">
                  Tune in
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChannelsMock() {
  const channels: Array<{ name: string; arts: ArtId[]; count: number }> = [
    { name: 'Frogs in the rain', arts: ['frog', 'frogRain', 'wave', 'frog'], count: 23 },
    { name: 'Food you’ll cook one day', arts: ['steak', 'peaks', 'steak', 'cat'], count: 41 },
  ]
  return (
    <div className="grid grid-cols-2 gap-4">
      {channels.map((c) => (
        <div key={c.name} className="flex flex-col gap-2 rounded-[24px] bg-nx-surface p-3">
          <div className="grid aspect-square grid-cols-2 gap-1.5">
            {c.arts.map((a, i) => (
              <Post key={i} art={a} className="rounded-[12px]" />
            ))}
          </div>
          <span className="px-1 text-[15px] font-extrabold">{c.name}</span>
          <span className="px-1 text-[13px] text-nx-muted">{`${c.count} posts · made for you`}</span>
        </div>
      ))}
    </div>
  )
}

function PhonesMock() {
  return (
    <div className="flex items-end justify-center gap-4">
      {(
        [
          { net: 'tiktok', art: 'skate', os: 'iPhone', label: 'TikTok' },
          { net: 'youtube', art: 'frogRain', os: 'Android', label: 'YouTube' },
        ] as Array<{ net: string; art: ArtId; os: string; label: string }>
      ).map((p, i) => (
        <div
          key={p.os}
          className={cn('flex flex-col items-center gap-3', i === 1 && 'translate-y-6')}
        >
          <div className="relative aspect-[9/19] w-[170px] overflow-hidden rounded-[32px] border-[5px] border-[#2a2620] bg-black md:w-[200px]">
            <Art id={p.art} className="absolute inset-0 h-full w-full opacity-40" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 rounded-t-[22px] bg-nx-surface p-3">
              <span className="mx-auto h-1 w-8 rounded bg-[#4a453c]" />
              <span className="flex items-center gap-1.5">
                <Gob size={20} />
                <span className="font-nx-serif text-[18px] leading-none">adhx</span>
              </span>
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-nx-soft">
                <NetworkIcon platform={p.net} className="h-3.5 w-3.5 text-white" />
                <span>{p.label}</span>
              </span>
              <span className="rounded-[12px] bg-black px-2.5 py-2 text-[13px] font-extrabold">
                Saved to your ADHX
              </span>
            </div>
          </div>
          <span className="text-[13px] font-bold text-nx-muted">{p.os}</span>
        </div>
      ))}
    </div>
  )
}

function ClaudeMock() {
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-nx-surface p-5 font-mono text-[14px] leading-relaxed">
      <span className="text-nx-muted">You</span>
      <span className="rounded-[14px] bg-black px-4 py-3 font-nx-sans text-[15px]">
        Find my saved videos with a frog in them
      </span>
      <span className="text-nx-muted">Claude, with the adhx skill</span>
      <span className="rounded-[14px] bg-black px-4 py-3 font-nx-sans text-[15px] leading-relaxed text-nx-soft">
        <span className="font-bold text-white">Two strong matches.</span>
        <span>
          {' '}
          A frog sitting out the rain under a yellow umbrella, from YouTube, saved yesterday, and a
          pond video from X. Here are the links.
        </span>
      </span>
    </div>
  )
}

/* ——— The page ——— */

export function ProductSite() {
  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3 md:px-8">
          <a href="#top" aria-label="adhx" className="gob-host flex items-center gap-2.5">
            <Gob size={32} />
            <span className="font-nx-serif text-2xl leading-none">adhx</span>
          </a>
          <nav
            aria-label="Sections"
            className="ml-6 hidden gap-6 text-[14px] font-bold text-nx-soft md:flex"
          >
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#apps" className="hover:text-white">
              Apps
            </a>
            <a href="#self-host" className="hover:text-white">
              Self-host
            </a>
          </nav>
          <span className="flex-1" />
          <a
            href={GITHUB_URL}
            className="flex min-h-[44px] items-center gap-2 rounded-full bg-nx-accent px-4 text-[14px] font-extrabold text-black"
          >
            <GitHubMark className="h-[18px] w-[18px]" />
            <span>GitHub</span>
          </a>
        </div>
      </header>

      <main id="top">
        <section
          aria-labelledby="hero-title"
          className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 pb-10 pt-12 md:px-8 md:pt-20"
        >
          <div className="flex flex-col items-start gap-6">
            <h1
              id="hero-title"
              className="m-0 font-nx-serif text-[54px] font-normal leading-[0.95] md:text-[96px]"
            >
              <span>Keep every post you love. </span>
              <span className="text-nx-accent">On your own server.</span>
            </h1>
            <p className="m-0 max-w-[720px] text-[18px] leading-relaxed text-nx-soft md:text-[21px]">
              ADHX saves posts from X, Instagram, TikTok, YouTube, Reddit and nine more networks. It
              keeps the originals in full quality on your own server, and finds anything again when
              you describe it. Open source, for you and your friends.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={GITHUB_URL}
                className="flex min-h-[52px] items-center gap-2.5 rounded-full bg-nx-accent px-6 text-[16px] font-extrabold text-black"
              >
                <GitHubMark className="h-5 w-5" />
                <span>Get it on GitHub</span>
              </a>
              <a
                href="#self-host"
                className="flex min-h-[52px] items-center rounded-full border-[1.5px] border-nx-cream px-6 text-[16px] font-extrabold text-nx-cream"
              >
                Run your own in five minutes
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <HeroReel />
            <a
              href="/site/adhx-reel.mp4"
              download
              className="self-center text-[14px] font-bold text-nx-soft underline underline-offset-4 hover:text-white"
            >
              Download the video (MP4, 30 seconds)
            </a>
          </div>
        </section>

        <section aria-labelledby="networks-title" className="border-y border-white/5 bg-[#0b0a09]">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-12 md:px-8">
            <h2
              id="networks-title"
              className="m-0 text-center text-[13px] font-extrabold uppercase tracking-[0.16em] text-nx-muted"
            >
              Fourteen networks, one place
            </h2>
            <ul className="m-0 grid list-none grid-cols-4 gap-3 p-0 sm:grid-cols-7">
              {ALL_PLATFORMS.map((p) => (
                <li key={p} className="flex flex-col items-center gap-2">
                  <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-nx-surface">
                    <NetworkIcon platform={p} className="h-6 w-6 text-white" />
                  </span>
                  <span className="text-[12px] text-nx-soft">{networkLabel(p)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div id="features">
          <Section
            id="search"
            kicker="Search by meaning"
            title={<span>Describe it. Find it.</span>}
            body={
              <>
                <p className="m-0">
                  Type what you remember, like “a frog in a pond” or “that synth video”, and ADHX
                  finds it. It matches what posts say, what’s in their pictures, and what happens in
                  their videos, with a frame looked at every 2 seconds.
                </p>
                <p className="m-0">
                  It runs Google’s EmbeddingGemma 2 on your own server: no API key, no cost per
                  search, and your saves stay on your machine.
                </p>
              </>
            }
          >
            <SearchMock />
          </Section>

          <Section
            id="keep"
            flip
            kicker="Your own copies"
            title={<span>Kept in the original.</span>}
            body={
              <>
                <p className="m-0">
                  Every save is downloaded once, at the best quality the network offers (4K from X
                  when the post has it), and played from your disk. Deleted posts and dead links
                  don’t take your saves with them.
                </p>
                <p className="m-0">
                  Videos are made playable in every browser, downloads pause before your disk fills,
                  and files are tidied away when nobody has the post saved any more.
                </p>
              </>
            }
          >
            <KeepMock />
          </Section>

          <Section
            id="player"
            kicker="The player"
            title={<span>Watch your saves, full screen.</span>}
            body={
              <>
                <p className="m-0">
                  Your saves play one after another, newest first: videos, photos, threads and
                  articles. Tap the network’s mark to open the original, tap the sparkle for more
                  like this, or send the file to a friend.
                </p>
              </>
            }
          >
            <TheaterMock />
          </Section>

          <Section
            id="now"
            flip
            kicker="Right now"
            title={<span>See what your friends are saving.</span>}
            body={
              <>
                <p className="m-0">
                  ADHX groups what everyone on your server is saving into moments, as it happens,
                  and counts the people behind them without naming anyone. Tune in to watch a moment
                  together.
                </p>
              </>
            }
          >
            <NowMock />
          </Section>

          <Section
            id="channels"
            kicker="Channels"
            title={<span>Made for you, and by you.</span>}
            body={
              <>
                <p className="m-0">
                  ADHX sorts your saves into channels by what they’re about and names them. Make
                  your own too, keep them private, or share them with a link.
                </p>
              </>
            }
          >
            <ChannelsMock />
          </Section>

          <Section
            id="x"
            flip
            kicker="X bookmarks"
            title={<span>Bookmark on X. It’s here within the hour.</span>}
            body={
              <>
                <p className="m-0">
                  Connect X once and ADHX brings in your bookmarks, then checks for new ones every
                  hour. No syncing by hand.
                </p>
              </>
            }
          >
            <div className="flex flex-col gap-3 rounded-[28px] bg-nx-surface p-5">
              {[
                { t: '12:00', n: 3 },
                { t: '11:00', n: 1 },
                { t: '10:00', n: 0 },
              ].map((r) => (
                <div
                  key={r.t}
                  className="flex items-center gap-3 rounded-[16px] bg-black px-4 py-3"
                >
                  <NetworkIcon platform="twitter" className="h-5 w-5 text-white" />
                  <span className="flex-1 text-[15px] font-bold">{`Automatic sync · ${r.t}`}</span>
                  <span className="text-[15px] font-extrabold text-nx-accent">{`+${r.n} new`}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section
          id="apps"
          kicker="iPhone and Android"
          title={<span>Share from any app.</span>}
          body={
            <>
              <p className="m-0">
                The companion apps put ADHX in your phone’s share menu. Share a post from TikTok,
                Instagram, YouTube or anywhere else, and it’s saved to your server in one tap, even
                when you’re offline.
              </p>
              <p className="m-0">
                Connect a phone by scanning a code in Settings. The apps only ever send links.
              </p>
            </>
          }
        >
          <PhonesMock />
        </Section>

        <Section
          id="claude"
          flip
          kicker="Search from Claude"
          title={<span>Ask Claude about your saves.</span>}
          body={
            <>
              <p className="m-0">
                Add the adhx skill to Claude and give it a key from your Settings. Then ask for
                anything you saved, in plain words, pictures and videos included. Keys can only
                read.
              </p>
            </>
          }
        >
          <ClaudeMock />
        </Section>

        <section
          id="self-host"
          aria-labelledby="self-host-title"
          className="border-t border-white/5 bg-[#0b0a09]"
        >
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 md:grid-cols-[1fr_1.1fr] md:gap-16 md:px-8 md:py-24">
            <div className="flex flex-col gap-5">
              <span className="text-[13px] font-extrabold uppercase tracking-[0.16em] text-nx-accent">
                Self-hosted
              </span>
              <h2
                id="self-host-title"
                className="m-0 font-nx-serif text-[44px] font-normal leading-[0.98] md:text-[60px]"
              >
                Yours. Not ours.
              </h2>
              <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[17px] leading-relaxed text-nx-soft">
                {[
                  'One Docker container and one folder of data. Back it up like anything else.',
                  'Invite only the people you choose. No email service needed: you can hand sign-in links over yourself.',
                  'Search runs on your server. Nothing goes to an AI company unless you add the optional TypeSafe key, which sharpens search and names channels.',
                  'Open source under the MIT licence. No accounts with us, no ads, no tracking.',
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span className="mt-[9px] h-2 w-2 shrink-0 rounded-full bg-nx-accent" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <CopyCommand text={SETUP} />
              <a
                href={GITHUB_URL}
                className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-full bg-nx-accent px-6 text-[16px] font-extrabold text-black"
              >
                <GitHubMark className="h-5 w-5" />
                <span>Read the setup guide on GitHub</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-4 py-8 text-[14px] text-nx-muted md:px-8">
          <span className="gob-host flex items-center gap-2">
            <Gob size={24} />
            <span className="font-nx-serif text-[20px] leading-none text-white">adhx</span>
          </span>
          <span>Save it. Lose it. Find it.</span>
          <span className="flex-1" />
          <a href={GITHUB_URL} className="hover:text-white">
            GitHub
          </a>
          <a href="/privacy" className="hover:text-white">
            Privacy
          </a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="hover:text-white">
            MIT licence
          </a>
        </div>
      </footer>
    </div>
  )
}
