import type { ReactNode } from 'react'
import { Art } from './art'
import { cn } from './cn'
import { CopyCommand } from './CopyCommand'
import { Gob } from './Gob'
import { Meme } from './Meme'
import { NetworkIcon } from './NetworkIcon'
import { ALL_PLATFORMS, networkLabel } from './networks'
import { Face, type PersonId } from './People'
import { PhoneFrame, PlayerScreen, ShareCardScreen, WebFrame, u } from './frames'
import { Arrow, Check, Chat, GitHubMark, Heart, Menu } from './icons'
import {
  ChannelsMock,
  FacesMock,
  InvitesMock,
  LiveMock,
  Mock,
  NewMock,
  SearchMock,
  StepFeed,
  StepKeep,
  StepShare,
  VaultMock,
} from './mocks'

/**
 * adhx.com: the product site (static, on GitHub Pages). What ADHX does, shown
 * in its own design with illustrated posts (never anyone's real ones), and how
 * to run your own. Fluid from 320px up: below `md` it follows the phone board,
 * from `lg` the desktop one.
 */

export const GITHUB_URL = 'https://github.com/itsmemeworks/adhx'

const SETUP = `git clone https://github.com/itsmemeworks/adhx && cd adhx
cp .env.example .env
openssl rand -base64 32
# Edit .env: keep that secret, set your HTTPS address,
# invited emails, EMAIL_LINKS_TO_ADMIN=1, ADHX_IMAGE=adhx:local
docker build -t adhx:local .
docker compose config --quiet
docker compose up -d`

const WRAP = 'mx-auto w-full max-w-[1264px] px-4 md:px-8'

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#apps', label: 'Apps' },
  { href: '#self-host', label: 'Self-host' },
]

/* ——— Bits ——— */

function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-[12px] font-extrabold uppercase tracking-[0.16em] text-nx-accent md:text-[13px]">
      {children}
    </span>
  )
}

function Dot({ className }: { className?: string }) {
  return <span aria-hidden className={cn('shrink-0 rounded-full bg-nx-accent', className)} />
}

function GitHubButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <a
      href={GITHUB_URL}
      className={cn(
        'flex min-h-[52px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-nx-accent px-6 text-[16px] font-extrabold text-black hover:bg-white',
        className,
      )}
    >
      <GitHubMark className="h-5 w-5" />
      <span>{children}</span>
    </a>
  )
}

/** A reaction floating past, as in Live. */
function Reaction({
  who,
  text,
  className,
  delay = 0,
  hot = false,
}: {
  who: PersonId
  text: string
  className?: string
  delay?: number
  hot?: boolean
}) {
  return (
    <span
      className={cn(
        'nx-float inline-flex h-[34px] items-center gap-2 whitespace-nowrap rounded-full bg-black/65 pl-1 pr-3.5 text-[13px] font-extrabold text-white backdrop-blur-md md:h-10 md:text-[15px]',
        hot
          ? 'border-[1.5px] border-[#ff8fa3]/70 shadow-[0_10px_24px_rgba(0,0,0,0.45)]'
          : 'border border-white/15',
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <Face who={who} size={26} className="md:!h-[30px] md:!w-[30px] md:!text-[12px]" />
      <span>{text}</span>
    </span>
  )
}

/* ——— Header ——— */

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-nx-ink/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-lg">
      <div className={cn(WRAP, 'flex h-16 items-center gap-3 md:h-[72px] md:gap-12')}>
        <a
          href="#top"
          aria-label="adhx, back to the top"
          className="gob-host flex items-center gap-2.5 text-nx-cream"
        >
          <Gob size={34} />
          <span className="font-nx-serif text-[28px] leading-none md:text-[30px]">adhx</span>
        </a>
        <nav aria-label="Sections" className="hidden gap-8 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="whitespace-nowrap text-[15px] font-semibold text-nx-soft hover:text-white"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <span className="flex-1" />
        <a
          href={GITHUB_URL}
          className="hidden min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full bg-nx-accent pl-4 pr-5 text-[15px] font-extrabold text-black hover:bg-white md:flex"
        >
          <GitHubMark className="h-[18px] w-[18px]" />
          <span>GitHub</span>
        </a>
        <details className="nx-menu relative md:hidden">
          <summary
            aria-label="Menu"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-nx-surface text-nx-cream"
          >
            <Menu size={20} />
          </summary>
          <nav
            aria-label="Sections"
            className="absolute right-0 top-[52px] flex w-56 flex-col rounded-[20px] border border-white/10 bg-nx-surface p-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
          >
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="flex min-h-[44px] items-center rounded-[14px] px-3 text-[15px] font-semibold text-nx-cream hover:bg-[#262320]"
              >
                {n.label}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              className="mt-1 flex min-h-[44px] items-center gap-2 rounded-full bg-nx-accent px-4 text-[15px] font-extrabold text-black"
            >
              <GitHubMark className="h-[18px] w-[18px]" />
              <span>GitHub</span>
            </a>
          </nav>
        </details>
      </div>
    </header>
  )
}

/* ——— Hero ——— */

function HeroComposition() {
  return (
    <Mock
      label="ADHX on a laptop, playing an elephant video you, Ana and two others saved, with the meme caption: First video ever uploaded. Still better than your For You page. Next to it, ADHX on a phone playing a toy hamster video Ana and Ben saved, with reactions floating up from Jo, Ben and Ana, and a note that Mum just saved one."
      className="mx-auto w-full max-w-[740px]"
    >
      <div className="relative aspect-[358/300] md:aspect-[740/488]">
        <div className="pointer-events-none absolute -left-[10%] top-[40%] h-[120%] w-[130%] rounded-full bg-[radial-gradient(rgba(255,210,63,0.13),rgba(255,210,63,0)_62%)] md:left-[20%] md:top-[30%] md:w-[110%]" />
        <WebFrame className="absolute left-0 top-[6.7%] w-[67%] md:top-[7.4%] md:w-[83.8%]" />
        <PhoneFrame className="absolute left-[64%] top-0 w-[36%] md:left-[68.6%] md:w-[31.4%]">
          <PlayerScreen
            art="hamster"
            savers={['ana', 'ben']}
            savedLine="Ana and Ben saved this"
            ago="2h"
            network="Reddit video"
            caption="The hamster repeats everything he says. He has not made peace with this."
            newCount={12}
            saved
          />
        </PhoneFrame>
        <div className="absolute left-[40%] top-[47%] flex flex-col items-start gap-2 md:left-[70.6%] md:top-[36%] md:gap-2.5">
          <Reaction who="jo" text="who sent this" className="hidden opacity-40 md:inline-flex" />
          <Reaction who="ben" text="again" className="opacity-60" delay={700} />
          <Reaction who="ana" text="ha" hot delay={1400} />
        </div>
        <div className="absolute left-0 top-[80%] flex h-[52px] items-center gap-2.5 rounded-[16px] border border-[#ffb35c]/45 bg-[#262320]/95 py-1.5 pl-1.5 pr-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-md md:left-[3.8%] md:top-[82.4%] md:h-[60px] md:gap-3 md:rounded-[18px] md:pl-2 md:pr-[18px]">
          <span className="relative shrink-0">
            <span className="relative block h-[38px] w-[38px] overflow-hidden rounded-[10px] md:h-11 md:w-11 md:rounded-[12px]">
              <Art id="steak" className="absolute inset-0 h-full w-full" />
            </span>
            <Face who="mum" size={18} ring="#262320" className="absolute -bottom-1 -right-1" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="whitespace-nowrap text-[13px] font-extrabold md:text-[14px]">
              Mum saved one
            </span>
            <span className="whitespace-nowrap text-[11px] text-nx-soft md:text-[12px]">
              Pinterest video · just now
            </span>
          </span>
        </div>
      </div>
    </Mock>
  )
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden pb-12 pt-6 md:pb-20 md:pt-12 lg:pb-24 lg:pt-16"
    >
      <div className={cn(WRAP, 'flex flex-col gap-4 md:gap-8')}>
        <h1
          id="hero-title"
          className="m-0 font-nx-serif text-[46px] font-normal leading-[0.95] tracking-[-0.015em] md:text-[68px] lg:text-[clamp(68px,6.4vw,92px)]"
        >
          <span className="block">
            <span className="block md:inline">Your friends have </span>
            <span className="block md:inline">better taste</span>
          </span>
          <span className="block text-nx-accent">than the algorithm.</span>
        </h1>
        <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:gap-10">
          <div className="flex flex-col items-stretch gap-6 md:items-start lg:w-[420px] lg:shrink-0 lg:gap-7 lg:pt-2">
            <p className="m-0 max-w-[640px] text-[16px] leading-[1.45] text-nx-soft md:text-[19px] md:leading-[1.5]">
              A private feed of the best of every social network, picked by your closest friends and
              family, on a box you own. Real copies, found by what you remember, sent on to any app.
            </p>
            <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:gap-3 lg:flex-col lg:items-start">
              <GitHubButton>Get it on GitHub</GitHubButton>
              <a
                href="#self-host"
                className="flex min-h-[52px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full border-[1.5px] border-nx-cream px-6 text-[16px] font-extrabold text-nx-cream hover:bg-white/10"
              >
                <span>Start a feed for your people</span>
                <Arrow size={18} className="hidden md:block" />
              </a>
            </div>
            <ul className="m-0 hidden list-none flex-col gap-2.5 p-0 text-[15px] text-nx-muted md:flex">
              {[
                'Self-hosted and open source, MIT licence',
                'No ads, no strangers, no growth meetings',
                'Web, iPhone and Android',
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <Dot className="h-1.5 w-1.5" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <a
              href="/adhx-reel.mp4"
              download
              className="self-center text-[14px] font-bold text-nx-soft underline underline-offset-4 hover:text-white md:self-start"
            >
              Download the 30-second tour (MP4)
            </a>
          </div>
          <div className="min-w-0 flex-1 lg:pt-0">
            <HeroComposition />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ——— Networks ——— */

function Networks() {
  return (
    <section
      aria-labelledby="nets-title"
      className="border-y border-white/10 bg-black py-10 md:py-12"
    >
      <div className={cn(WRAP, 'flex flex-col gap-5 md:gap-6')}>
        <div className="flex flex-col gap-1.5 md:flex-row md:items-baseline md:justify-between md:gap-6">
          <h2
            id="nets-title"
            className="m-0 font-nx-serif text-[30px] font-normal leading-none md:text-[38px]"
          >
            <span>Fourteen networks. </span>
            <span className="text-nx-accent">One feed.</span>
          </h2>
          <p className="m-0 text-[14px] text-nx-muted md:text-[15px]">
            Save from any of them. Watch all of them here.
          </p>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0 md:gap-2.5 xl:grid xl:grid-cols-7">
          {ALL_PLATFORMS.map((p) => (
            <li
              key={p}
              className="flex h-[34px] items-center gap-2 rounded-full border border-white/10 bg-nx-surface pl-[5px] pr-3 md:h-12 md:gap-2.5 md:pl-2 md:pr-3.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-[#262320] md:h-8 md:w-8 md:rounded-[10px]">
                <NetworkIcon
                  platform={p}
                  className="h-3.5 w-3.5 text-white md:h-[18px] md:w-[18px]"
                />
              </span>
              <span className="whitespace-nowrap text-[13px] font-semibold md:text-[15px]">
                {networkLabel(p)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ——— How it works ——— */

const STEPS: Array<{
  n: string
  title: string
  body: string
  short: string
  Visual: (p: { compact?: boolean }) => ReactNode
}> = [
  {
    n: '01',
    title: 'Your people save from any app',
    body: 'Hit share in whatever app you’re in and pick ADHX. Or paste the link. Anyone you invited can add to the pile.',
    short: 'Hit share wherever you are and pick ADHX. Or paste the link.',
    Visual: StepShare,
  },
  {
    n: '02',
    title: 'Your box keeps a real copy',
    body: 'It downloads the actual video or photos, in the best quality going, onto a server you run. Not a link. The thing.',
    short: 'The actual video or photos, in the best quality going. Not a link.',
    Visual: StepKeep,
  },
  {
    n: '03',
    title: 'Everyone gets one feed',
    body: 'Everything your lot kept, full screen, with their faces on it. No ads in between, no strangers, no “suggested for you”.',
    short: 'Full screen, with their faces on it. No ads in between.',
    Visual: StepFeed,
  },
]

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 py-10 md:py-16">
      <div className={WRAP}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="flex flex-col gap-2.5 md:gap-3.5">
            <Kicker>How it works</Kicker>
            <h2
              id="how-title"
              className="m-0 font-nx-serif text-[36px] font-normal leading-[0.95] tracking-[-0.01em] md:whitespace-nowrap md:text-[60px] lg:text-[48px] xl:text-[60px]"
            >
              <span className="block md:inline">Three steps. </span>
              <span className="block md:inline">No algorithm.</span>
            </h2>
          </div>
          <p className="m-0 max-w-[430px] font-nx-serif text-[22px] leading-[1.1] text-nx-soft md:text-[30px] md:leading-[1.08] lg:max-w-[340px] lg:text-[26px] xl:max-w-[430px] xl:text-[30px]">
            <span>Nothing leaves your house unless </span>
            <span className="text-nx-cream">one of you sends it.</span>
          </p>
        </div>
        <ol className="m-0 mt-5 flex list-none flex-col gap-3 p-0 md:mt-10 md:gap-5 lg:mt-11 lg:grid lg:grid-cols-3 lg:gap-6">
          {STEPS.map(({ n, title, body, short, Visual }) => (
            <li key={n}>
              <div className="flex gap-3.5 lg:hidden">
                <span aria-hidden className="shrink-0">
                  <Visual compact />
                </span>
                <span className="flex min-w-0 flex-col gap-1 pt-0.5">
                  <span className="text-[12px] font-extrabold text-nx-accent">{n}</span>
                  <h3 className="m-0 text-[16px] font-extrabold leading-tight md:text-[19px]">
                    {title}
                  </h3>
                  <p className="m-0 text-[14px] leading-snug text-nx-soft md:text-[15px]">
                    <span className="md:hidden">{short}</span>
                    <span className="hidden md:inline">{body}</span>
                  </p>
                </span>
              </div>
              <div className="hidden h-full overflow-hidden rounded-[24px] border border-white/10 bg-nx-surface lg:block">
                <div aria-hidden>
                  <Visual />
                </div>
                <div className="flex flex-col gap-2 px-[22px] pb-6 pt-5">
                  <span className="text-[13px] font-extrabold text-nx-accent">{n}</span>
                  <h3 className="m-0 text-[22px] font-extrabold leading-[1.2]">{title}</h3>
                  <p className="m-0 text-[15px] leading-[1.5] text-nx-soft">{body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ——— Features ——— */

function Feature({
  id,
  kicker,
  title,
  children,
  mock,
  flip = false,
  dark = false,
}: {
  id: string
  kicker: ReactNode
  title: string
  children: ReactNode
  mock: ReactNode
  flip?: boolean
  dark?: boolean
}) {
  return (
    <section aria-labelledby={id} className={cn(dark && 'bg-black')}>
      <div
        className={cn(
          WRAP,
          'grid items-center gap-4 pb-9 pt-7 md:gap-8 md:py-14 lg:min-h-[440px] lg:gap-16 lg:py-8',
          flip
            ? 'lg:grid-cols-[minmax(0,620fr)_minmax(0,516fr)]'
            : 'lg:grid-cols-[minmax(0,516fr)_minmax(0,620fr)]',
        )}
      >
        <div className={cn('flex flex-col gap-2.5 md:gap-4', flip && 'lg:order-2')}>
          <Kicker>{kicker}</Kicker>
          <h2
            id={id}
            className="m-0 font-nx-serif text-[34px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[48px] lg:text-[56px]"
          >
            {title}
          </h2>
          <div className="flex flex-col gap-3 text-[15px] leading-[1.45] text-nx-soft md:text-[18px] md:leading-[1.55]">
            {children}
          </div>
        </div>
        <div
          className={cn('mx-auto w-full min-w-0 max-w-[620px] pt-2 lg:pt-0', flip && 'lg:order-1')}
        >
          {mock}
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <div id="features" className="scroll-mt-16 border-t border-white/10">
      <Feature
        id="f-new"
        kicker="New"
        title="Only what you haven’t seen. Then it stops."
        mock={<NewMock />}
      >
        <p className="m-0">
          New plays what your people saved that you haven’t seen yet, and every post says why it’s
          next: saved together, close to you, like what you keep. Videos and photos by default; text
          posts and articles when you want them. No infinite scroll, no autoplay hole.
        </p>
      </Feature>

      <Feature
        id="f-faces"
        kicker="Saver faces"
        title="Ana and Ben saved this."
        mock={<FacesMock />}
        flip
        dark
      >
        <p className="m-0">
          <span>
            Every post wears the faces of whoever kept it, so you know whose taste you’re trusting.
            Saves go to your people by default. Flip{' '}
          </span>
          <strong className="font-extrabold text-nx-cream">Just for me</strong>
          <span> and it stays out of everyone else’s feed, channels and search.</span>
        </p>
      </Feature>

      <Feature
        id="f-vault"
        kicker="The meme vault"
        title="Deleted on X. Still here."
        mock={<VaultMock />}
      >
        <p className="m-0">
          ADHX keeps a real copy of every save, in the best quality the network offers, and plays it
          from your box. When the original gets nuked, yours doesn’t notice. Share sends the actual
          file to any app, not a link that dies next month.
        </p>
        <p className="m-0 text-[14px] text-nx-muted md:text-[15px]">
          Posts that are private or DRM-protected when you save them may not download.
        </p>
      </Feature>

      <Feature
        id="f-search"
        kicker="Search"
        title="Nobody remembers captions."
        mock={<SearchMock />}
        flip
        dark
      >
        <p className="m-0">
          Type what you remember. ADHX hears what’s said in the video and reads the text on screen,
          so the meme turns up by its punchline. It runs on your box: no frame or sound leaves it.
        </p>
        <p className="m-0 flex items-start gap-2.5 text-[14px] leading-[1.5] text-nx-muted md:text-[15px]">
          <Chat size={18} className="mt-0.5 shrink-0 text-nx-accent" />
          <span>
            <strong className="font-extrabold text-nx-cream">Search from Claude too.</strong>
            <span>
              {' '}
              Add the adhx skill with a read-only key and ask for anything you saved, in plain
              words.
            </span>
          </span>
        </p>
      </Feature>

      <Feature
        id="f-channels"
        kicker="Channels"
        title="Rabbit holes, dug by your friends."
        mock={<ChannelsMock />}
      >
        <p className="m-0">
          ADHX sorts everyone’s saves into channels by what they’re about, and names them. Every
          friend gets one too: everything they kept, with what’s new to you on top. Make your own
          and share it with a link.
        </p>
      </Feature>

      <Feature
        id="f-live"
        kicker={
          <>
            <span aria-hidden className="nx-pulse h-2 w-2 rounded-full bg-[#ff5a3c]" />
            <span>Live</span>
          </>
        }
        title="Watch together. Heckle in real time."
        mock={<LiveMock />}
        flip
        dark
      >
        <p className="m-0">
          Live gathers what your lot are saving tonight into moments. Tune in and see who’s watching
          with you, who just saved the next one, and every “ha” and “who sent this” as it floats
          past.
        </p>
      </Feature>

      <Feature
        id="f-invites"
        kicker="Invites"
        title="One link. They’re in, phone and all."
        mock={<InvitesMock />}
      >
        <p className="m-0">
          Send a friend one link. It signs them in and pairs their phone in the same go. It works
          once and runs out after a week, so nobody gets in uninvited. Approve who joins, if you
          like.
        </p>
      </Feature>
    </div>
  )
}

/* ——— Apps ——— */

function Apps() {
  return (
    <section
      id="apps"
      aria-labelledby="apps-title"
      className="relative scroll-mt-16 overflow-hidden border-t border-white/10 bg-black"
    >
      <div className="pointer-events-none absolute -left-[15%] top-[40%] h-[380px] w-[130%] rounded-full bg-[radial-gradient(rgba(255,210,63,0.1),rgba(255,210,63,0)_62%)] lg:left-[52%] lg:top-[6%] lg:h-[520px] lg:w-[760px]" />
      <div
        className={cn(
          WRAP,
          'relative grid items-center gap-5 pb-10 pt-8 md:gap-10 md:py-16 lg:min-h-[600px] lg:grid-cols-[minmax(0,516fr)_minmax(0,620fr)] lg:gap-16 lg:py-5',
        )}
      >
        <div className="flex flex-col gap-2.5 md:gap-4">
          <Kicker>iPhone and Android</Kicker>
          <h2
            id="apps-title"
            className="m-0 font-nx-serif text-[34px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[48px] lg:text-[56px]"
          >
            <span className="block md:inline">Share from any app. </span>
            <span className="block md:inline">Send to any app.</span>
          </h2>
          <p className="m-0 text-[15px] leading-[1.45] text-nx-soft md:text-[18px] md:leading-[1.55]">
            Hit share anywhere and pick ADHX. The post lands on your box, for your people or just
            for you. Then it plays in the same full-screen player, and Share sends the actual video
            to the group chat.
          </p>
          <ul className="m-0 mt-1 hidden list-none flex-col gap-2.5 p-0 md:flex">
            {[
              'Save from any app’s share button',
              'The full-screen player, one after another',
              'New · Channels · Live, a tap apart',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-[16px] font-semibold">
                <Check size={18} className="shrink-0 text-nx-accent" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-nx-muted md:text-[14px]">
            <span>
              The apps are build-from-source for now: there are no store downloads in this release.
              Follow the{' '}
            </span>
            <a
              href={`${GITHUB_URL}/blob/main/apps/ios/README.md`}
              className="text-nx-accent underline underline-offset-2 hover:text-white"
            >
              iPhone
            </a>
            <span> or </span>
            <a
              href={`${GITHUB_URL}/blob/main/apps/android/README.md`}
              className="text-nx-accent underline underline-offset-2 hover:text-white"
            >
              Android
            </a>
            <span> setup guide on GitHub.</span>
          </p>
        </div>
        <Mock
          label="Two phones: the ADHX share card keeping a copy of an X photo, 40 percent done, shared with your people with Just for me off; and New playing a steak video Mum saved, close to you."
          className="mx-auto w-full max-w-[620px]"
        >
          <div className="flex items-center justify-center gap-3.5 py-2 md:gap-10 md:py-6">
            <PhoneFrame className="w-[42%] max-w-[246px] md:-translate-y-3.5">
              <ShareCardScreen />
            </PhoneFrame>
            <PhoneFrame className="w-[42%] max-w-[246px] md:translate-y-3.5">
              <PlayerScreen
                art="steak"
                savers={['mum']}
                savedLine="Mum saved this"
                ago="1h"
                network="Pinterest video"
                newCount={8}
                progress={0.28}
                why={
                  <>
                    <Heart size={u(18)} className="text-nx-accent" />
                    <span>Close to you</span>
                  </>
                }
              />
            </PhoneFrame>
          </div>
        </Mock>
      </div>
    </section>
  )
}

/* ——— The band ——— */

function Band() {
  return (
    <section aria-labelledby="band-title" className="relative overflow-hidden bg-black">
      <div className="relative h-[220px] md:h-[300px] lg:absolute lg:inset-y-0 lg:left-[34%] lg:right-0 lg:h-auto">
        <Art id="elephant" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black lg:bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.82)_26%,rgba(0,0,0,0.1)_52%,rgba(0,0,0,0.3)_100%)]" />
        <span className="absolute inset-x-0 bottom-[22%] top-0 md:inset-x-[18%] lg:bottom-0 lg:left-auto lg:right-0 lg:w-[50%]">
          <Meme top="Zero ads were shown" bottom="During this elephant" size={7.5} />
        </span>
      </div>
      <div
        aria-hidden
        className="absolute right-[6%] top-1/2 hidden -translate-y-1/2 flex-col items-end gap-2.5 lg:flex"
      >
        <Reaction who="mum" text="who sent this" className="opacity-40" />
        <Reaction who="ana" text="again" className="opacity-70" delay={700} />
        <span
          className="nx-float flex h-12 items-center gap-2 rounded-[24px] bg-nx-cream pl-[7px] pr-[18px] text-[#141414] shadow-[0_14px_34px_rgba(0,0,0,0.45)]"
          style={{ animationDelay: '1400ms' }}
        >
          <Face who="ben" size={34} />
          <span className="whitespace-nowrap text-[17px] font-semibold">“you’re welcome”</span>
        </span>
      </div>
      <div
        className={cn(
          WRAP,
          'relative -mt-10 flex flex-col gap-2.5 pb-7 md:gap-4 md:pb-12 lg:mt-0 lg:min-h-[360px] lg:justify-center lg:gap-[18px] lg:py-12',
        )}
      >
        <h2
          id="band-title"
          className="m-0 max-w-[820px] font-nx-serif text-[36px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[56px] lg:max-w-[64%] lg:text-[clamp(52px,4.4vw,72px)] lg:tracking-[-0.015em]"
        >
          <span className="block">
            <span className="block md:inline">Built for short </span>
            <span>attention spans</span>
            <span className="md:hidden"> and</span>
          </span>
          <span className="block text-nx-accent">
            <span className="hidden md:inline">and </span>
            <span>long friendships.</span>
          </span>
        </h2>
        <p className="m-0 max-w-[520px] text-[14px] leading-[1.4] text-nx-soft md:text-[18px] md:leading-[1.5]">
          No streaks, no like counts, no strangers. Just your lot, and whatever Ben found today.
        </p>
      </div>
    </section>
  )
}

/* ——— Self-host ——— */

function SelfHost() {
  return (
    <section
      id="self-host"
      aria-labelledby="self-title"
      className="scroll-mt-16 border-t border-white/10"
    >
      <div
        className={cn(
          WRAP,
          'grid items-center gap-5 pb-10 pt-8 md:gap-10 md:py-16 lg:min-h-[600px] lg:grid-cols-[minmax(0,516fr)_minmax(0,620fr)] lg:gap-16',
        )}
      >
        <div className="flex flex-col gap-2.5 md:gap-4">
          <Kicker>Self-hosted</Kicker>
          <h2
            id="self-title"
            className="m-0 whitespace-nowrap font-nx-serif text-[48px] font-normal leading-[0.95] tracking-[-0.015em] md:text-[72px]"
          >
            <span>Yours. </span>
            <span className="text-nx-accent">Not ours.</span>
          </h2>
          <p className="m-0 hidden text-[18px] leading-[1.55] text-nx-soft md:block">
            ADHX isn’t a service you sign up to. It’s a box you run, for the people you’d actually
            let in your house.
          </p>
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-2 p-0 text-[15px] leading-[1.4] text-nx-cream md:gap-3 md:text-[16px] md:leading-[1.45]">
            {[
              'One Docker container and one folder of data.',
              'Invite-only. Approve who joins, if you like.',
              'Search runs on your server, what’s said and what’s on screen included. Nothing goes to an AI company unless you add the optional search refinement key.',
              'Kept media and shared previews play for anyone who can reach your server, so use private networking if that matters to you.',
              'No ads, nobody selling your attention. Open source under the MIT licence.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5 md:gap-3">
                <Dot className="mt-[7px] h-1.5 w-1.5 md:mt-2 md:h-[7px] md:w-[7px]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-3 md:gap-4">
          <Mock label="A meme over an illustration of a tangle of synth cables: Me explaining self-hosting to the group chat.">
            <span className="relative block aspect-[16/7] overflow-hidden rounded-[20px] border border-white/10 md:rounded-[24px]">
              <Art id="synth" className="absolute inset-0 h-full w-full" />
              <Meme top="Me explaining self-hosting" bottom="To the group chat" size={6.4} />
            </span>
          </Mock>
          <CopyCommand text={SETUP} title="Set it up" note="on your server" />
          <a
            href={`${GITHUB_URL}/blob/main/deploy/nas/README.md`}
            className="flex min-h-[52px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-nx-accent px-6 text-[16px] font-extrabold text-black hover:bg-white"
          >
            <GitHubMark className="h-5 w-5" />
            <span>Read the setup guide on GitHub</span>
          </a>
        </div>
      </div>
    </section>
  )
}

/* ——— The page ——— */

export function ProductSite() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-nx-ink font-nx-sans text-nx-cream">
      <Header />
      <main id="top">
        <Hero />
        <Networks />
        <HowItWorks />
        <Features />
        <Apps />
        <Band />
        <SelfHost />
      </main>
      <footer className="border-t border-white/10 bg-black">
        <div
          className={cn(
            WRAP,
            'flex flex-col gap-2.5 py-7 md:min-h-[112px] md:flex-row md:items-center md:gap-[18px] md:py-6',
          )}
        >
          <span className="gob-host flex items-center gap-2">
            <Gob size={28} />
            <span className="font-nx-serif text-[22px] leading-none md:text-[24px]">adhx</span>
          </span>
          <span className="text-[13px] text-nx-muted md:text-[14px]">
            Your friends have better taste than the algorithm.
          </span>
          <span className="hidden flex-1 md:block" />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1 md:gap-7">
            {[
              { href: GITHUB_URL, label: 'GitHub' },
              { href: `${GITHUB_URL}/blob/main/PRIVACY.md`, label: 'Privacy' },
              { href: `${GITHUB_URL}/blob/main/LICENSE`, label: 'MIT licence' },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="flex min-h-[44px] items-center whitespace-nowrap text-[14px] font-semibold text-nx-soft hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
