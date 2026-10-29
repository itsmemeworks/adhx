import type { ReactNode } from 'react'
import { cn } from './cn'
import { CopyCommand } from './CopyCommand'
import { Gob } from './Gob'
import { DEMO_URL, GITHUB_URL } from './links'
import { NetworkIcon } from './NetworkIcon'
import { networkLabel } from './networks'
import { Face, type PersonId } from './People'
import { Arrow, Check, Download, GitHubMark, Menu, Play } from './icons'
import { NavMenu } from './NavMenu'
import { TellAFriend } from './TellAFriend'
import pkg from '../../package.json'
import { Credit, PostMedia, creditedPosts } from './Post'
import { PhonePair, PhoneShot, WebShot } from './Shots'
import { Mock } from './mocks'
import { AdminSection } from './AdminSection'
import { AiSection } from './AiSection'
import { Faq } from './Faq'
import { Friends, GroupChat } from './Friends'

/**
 * adhx.com: the product site (static, on GitHub Pages). What ADHX does, shown
 * in its own design with real posts saved on an ADHX server (each credited to
 * its author; see components/Post.tsx), and how to run your own. Fluid from 320px up: below `md` it follows the phone board,
 * from `lg` the desktop one.
 */

export { DEMO_URL, GITHUB_URL }

const SETUP = `docker run -d --name adhx -p 3000:3000 \\
  -v adhx:/data ghcr.io/itsmemeworks/adhx
docker logs adhx | grep setup
# Open the link it prints. That's it.`

export const WRAP = 'mx-auto w-full max-w-[1264px] px-4 md:px-8'

const NAV = [
  { href: '#friends', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#ai', label: 'AI' },
  { href: '#apps', label: 'Apps' },
  { href: '#self-host', label: 'Self-host' },
  { href: '#faq', label: 'FAQ' },
]

/* ——— Bits ——— */

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-[12px] font-extrabold uppercase leading-[1.3] tracking-[0.16em] text-nx-accent md:text-[13px]">
      {children}
    </span>
  )
}

export function Dot({ className }: { className?: string }) {
  return <span aria-hidden className={cn('shrink-0 rounded-full bg-nx-accent', className)} />
}

const BUTTON =
  'flex min-h-[52px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full px-6 text-[16px] font-extrabold'
export const PRIMARY = cn(BUTTON, 'bg-nx-accent text-black hover:bg-white')
export const SECONDARY = cn(
  BUTTON,
  'border-[1.5px] border-nx-cream text-nx-cream hover:bg-white/10',
)

/** The release on the site, from the repo's package.json at build time (e.g. "v2.12"). */
export const RELEASE = `v${pkg.version.split('.').slice(0, 2).join('.')}`

/** A star costs nothing and is how people find the repo. */
export function StarButton({ className }: { className?: string }) {
  return (
    <a
      href={GITHUB_URL}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-nx-surface px-4 text-[15px] font-extrabold text-nx-cream hover:border-white/40 hover:text-white',
        className,
      )}
    >
      <GitHubMark className="h-[18px] w-[18px]" />
      <span>Star on GitHub</span>
    </a>
  )
}

/** The two ways in: look around the demo, or run your own. */
export function Ctas({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3', className)}>
      <a href={DEMO_URL} className={PRIMARY}>
        <Play size={18} />
        <span>Try the live demo</span>
      </a>
      <a href="#self-host" className={SECONDARY}>
        <span>Host your own</span>
        <Arrow size={18} />
      </a>
    </div>
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

/** On another page (`home` is `/`), the section links go back to the home page. */
export function Header({ home = '' }: { home?: string }) {
  const nav = NAV.map((n) => ({ ...n, href: n.href.startsWith('#') ? home + n.href : n.href }))
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-nx-ink/90 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-lg">
      <div className={cn(WRAP, 'flex h-[63px] items-center gap-3 md:h-[71px] md:gap-12')}>
        <a
          href={home || '#top'}
          aria-label={home ? 'adhx, the home page' : 'adhx, back to the top'}
          className="gob-host flex items-center gap-2.5 text-nx-cream"
        >
          <Gob size={34} />
          <span className="font-nx-serif text-[28px] leading-none md:text-[30px]">adhx</span>
        </a>
        <nav aria-label="Sections" className="hidden gap-7 lg:flex xl:gap-8">
          {nav.map((n) => (
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
          aria-label="ADHX on GitHub"
          className="hidden h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-nx-surface text-nx-cream hover:text-white lg:flex"
        >
          <GitHubMark className="h-[18px] w-[18px]" />
        </a>
        <a
          href={DEMO_URL}
          className="flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full bg-nx-accent pl-3.5 pr-4 text-[15px] font-extrabold text-black hover:bg-white sm:pl-4 sm:pr-5"
        >
          <Play size={15} />
          <span className="sm:hidden">Demo</span>
          <span className="hidden sm:inline">Try the demo</span>
        </a>
        <NavMenu
          summary={
            <summary
              aria-label="Menu"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-nx-surface text-nx-cream"
            >
              <Menu size={20} />
            </summary>
          }
        >
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="flex min-h-[44px] items-center rounded-[14px] px-3 text-[15px] font-semibold text-nx-cream hover:bg-[#262320]"
            >
              {n.label}
            </a>
          ))}
          <a
            href="/install/"
            className="flex min-h-[44px] items-center rounded-[14px] px-3 text-[15px] font-semibold text-nx-cream hover:bg-[#262320]"
          >
            Install the apps
          </a>
          <a
            href={GITHUB_URL}
            className="flex min-h-[44px] items-center gap-2 rounded-[14px] px-3 text-[15px] font-semibold text-nx-cream hover:bg-[#262320]"
          >
            <GitHubMark className="h-[18px] w-[18px]" />
            <span>GitHub</span>
          </a>
          <a
            href={DEMO_URL}
            className="mt-1 flex min-h-[44px] items-center gap-2 rounded-full bg-nx-accent px-4 text-[15px] font-extrabold text-black"
          >
            <Play size={15} />
            <span>Try the live demo</span>
          </a>
        </NavMenu>
      </div>
    </header>
  )
}

/* ——— Hero ——— */

function HeroComposition() {
  return (
    <Mock
      label="ADHX on a laptop: Home, playing a video Ana sent you, a pixel-art cat whose belly is a toy piano, from the game Offbeat, posted on X by @nexindie, with Up next and the New, Everyone, Friends and Mine switch beside it. Next to it, ADHX on an iPhone playing Aurora, a copper ribbon of sound twisting in 3D, posted on X by @joecroskey, with reactions floating up from Jo, Ben and Ana, and a note that Mum just saved the RC808 drum synth photos by @XWAVEart."
      className="mx-auto w-full max-w-[740px]"
    >
      <div className="relative aspect-[358/300] md:aspect-[740/488]">
        <div className="pointer-events-none absolute -left-[10%] top-[40%] h-[120%] w-[130%] rounded-full bg-[radial-gradient(rgba(255,210,63,0.13),rgba(255,210,63,0)_62%)] md:left-[20%] md:top-[30%] md:w-[110%]" />
        <WebShot
          src="web-home"
          alt=""
          className="absolute left-0 top-[6.7%] w-[67%] md:top-[7.4%] md:w-[83.8%]"
        />
        <PhoneShot
          src="iphone-home"
          alt=""
          className="absolute left-[64%] top-0 w-[36%] md:left-[68.6%] md:w-[31.4%]"
        />
        <div className="absolute left-[40%] top-[47%] flex flex-col items-start gap-2 md:left-[70.6%] md:top-[36%] md:gap-2.5">
          <Reaction who="jo" text="who sent this" className="hidden opacity-40 md:inline-flex" />
          <Reaction who="ben" text="again" className="opacity-60" delay={700} />
          <Reaction who="ana" text="ha" hot delay={1400} />
        </div>
        <div className="absolute left-0 top-[80%] flex h-[52px] items-center gap-2.5 rounded-[16px] border border-[#ffb35c]/45 bg-[#262320]/95 py-1.5 pl-1.5 pr-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-md md:left-[3.8%] md:top-[82.4%] md:h-[60px] md:gap-3 md:rounded-[18px] md:pl-2 md:pr-[18px]">
          <span className="relative shrink-0">
            <span className="relative block h-[38px] w-[38px] overflow-hidden rounded-[10px] md:h-11 md:w-11 md:rounded-[12px]">
              <PostMedia id="rc808" className="absolute inset-0 h-full w-full" />
            </span>
            <Face who="mum" size={18} ring="#262320" className="absolute -bottom-1 -right-1" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="whitespace-nowrap text-[13px] font-extrabold md:text-[14px]">
              Mum saved one
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-nx-soft md:text-[12px]">
              <Credit id="rc808" />
              <span>· just now</span>
            </span>
          </span>
        </div>
      </div>
    </Mock>
  )
}

/** Small, checkable facts: what it is, how alive it is, what it runs on. */
function ProofStrip() {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-2 p-0 text-[13px] font-semibold text-nx-muted md:text-[14px]">
      <li>
        <StarButton className="min-h-[36px] px-3 text-[13px] md:text-[14px]" />
      </li>
      {['Free and open source (MIT)', `${RELEASE} · 170+ releases`].map((t) => (
        <li key={t} className="flex items-center gap-2 whitespace-nowrap">
          <Dot className="h-1 w-1 bg-nx-muted" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden pb-12 pt-6 md:pb-20 md:pt-12 lg:pb-11 lg:pt-16"
    >
      <div className={cn(WRAP, 'flex flex-col gap-3 md:gap-6')}>
        <Kicker>
          <Dot className="h-1.5 w-1.5" />
          <span>Open source · Self-hosted · Friends only</span>
        </Kicker>
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
              <span className="md:hidden">
                A private social network for your friends and family. One of you runs it; everyone
                shares the best of TikTok, Instagram, X and eleven more into one feed.
              </span>
              <span className="hidden md:inline">
                A private social network for your friends and family. One of you runs it; everyone
                shares the best of TikTok, Instagram, X, YouTube and ten more, and it keeps a real
                copy of each in one feed, with their faces on.
              </span>
            </p>
            <div className="flex flex-col gap-3">
              <Ctas />
              <p className="m-0 text-[13px] leading-[1.5] text-nx-muted md:text-[14px]">
                <span>In the demo you’re Sam, and your friends have been busy. </span>
                <span className="whitespace-nowrap">No sign-up.</span>
              </p>
              <TellAFriend className="-mt-1" />
            </div>
            <ProofStrip />
          </div>
          <div className="min-w-0 flex-1 lg:pt-0">
            <HeroComposition />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ——— Features ——— */

function Feature({
  id,
  kicker,
  title,
  shortTitle,
  children,
  short,
  mock,
  flip = false,
  dark = false,
}: {
  id: string
  kicker: ReactNode
  title: string
  /** The phone board's shorter headline, below `md`. */
  shortTitle?: string
  children: ReactNode
  /** The phone board's shorter copy, below `md`. */
  short?: ReactNode
  mock: ReactNode
  flip?: boolean
  dark?: boolean
}) {
  return (
    <section aria-labelledby={id} className={cn(dark && 'bg-black')}>
      <div
        className={cn(
          WRAP,
          'grid items-center gap-4 pb-9 pt-7 md:gap-8 md:py-14 lg:min-h-[440px] lg:gap-16 lg:py-[30px]',
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
            {shortTitle ? (
              <>
                <span className="md:hidden">{shortTitle}</span>
                <span className="hidden md:inline">{title}</span>
              </>
            ) : (
              title
            )}
          </h2>
          {short && (
            <div className="flex flex-col gap-2 text-[15px] leading-[1.45] text-nx-soft md:hidden">
              {short}
            </div>
          )}
          <div
            className={cn(
              'flex-col gap-3 text-[15px] leading-[1.45] text-nx-soft md:flex md:text-[18px] md:leading-[1.55]',
              short ? 'hidden' : 'flex',
            )}
          >
            {children}
          </div>
        </div>
        <div
          className={cn(
            'mx-auto w-full min-w-0 max-w-[620px] md:pt-2 lg:pt-0',
            flip && 'lg:order-1',
          )}
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
        id="f-vault"
        kicker="The meme vault"
        title="Deleted on X. Still in your copy."
        short={
          <>
            <p className="m-0">
              A real copy of every save, in the best quality going. Share sends the actual file to
              any app.
            </p>
            <p className="m-0 text-[13px] text-nx-muted">
              ADHX can’t keep posts that are private or DRM-protected.
            </p>
          </>
        }
        mock={
          <PhonePair
            shots={[
              {
                src: 'iphone-send',
                alt: 'Sending from ADHX on iPhone: the video itself, 540p, 219 KB, not a link that dies next month. Send via WhatsApp, Copy, Files, Save to Photos, or straight to Pete, Jo, Ben or Mum.',
              },
            ]}
          />
        }
      >
        <p className="m-0">
          ADHX keeps a real copy of every save, in the best quality the network offers, and plays it
          from your box. When the original gets nuked, your group’s copy doesn’t notice. Share sends
          the actual file to any app, not a link that dies next month.
        </p>
        <p className="m-0 text-[14px] text-nx-muted md:text-[15px]">
          ADHX can’t keep posts that are private or DRM-protected when you save them.
        </p>
      </Feature>

      <Feature
        id="f-search"
        kicker="Search"
        title="Nobody remembers captions."
        short={
          <p className="m-0">
            Type what you remember: the punchline, what someone said, the words on screen. It turns
            up.
          </p>
        }
        mock={
          <WebShot
            src="web-search"
            alt="ADHX search on the web for colour palettes for a website: two strong matches, the best one playing, a colour palette inspiration site posted on X by @AdhamDannaway, saved by Jo and Mum."
          />
        }
        flip
        dark
      >
        <p className="m-0">
          <span>
            Type what you remember: the punchline, what someone said, the words on screen, “that cat
            that’s also a piano”. The meme turns up anyway.{' '}
          </span>
          <a href="#ai" className="font-semibold text-nx-cream underline-offset-2 hover:underline">
            How it knows
          </a>
          <span>.</span>
        </p>
      </Feature>

      <Feature
        id="f-faces"
        kicker="Saver faces"
        title="Ana and Ben saved this."
        short={
          <p className="m-0">
            <span>Every post wears the faces of whoever kept it. Shared by default; flip </span>
            <strong className="font-extrabold text-nx-cream">Just for me</strong>
            <span> to keep one to yourself.</span>
          </p>
        }
        mock={
          <PhonePair
            shots={[
              {
                src: 'android-share',
                alt: 'The ADHX share card on Android: Saved for your people, kept a copy at 600p. Jo, Ben, Ana and Mum will see it, a note field, and the Just for me switch, off.',
              },
            ]}
          />
        }
      >
        <p className="m-0">
          <span>
            Every post wears the faces of whoever kept it, so you know who to thank. Saves go to
            your people by default. Flip{' '}
          </span>
          <strong className="font-extrabold text-nx-cream">Just for me</strong>
          <span> and it stays out of everyone else’s feed, channels and search.</span>
        </p>
      </Feature>

      <Feature
        id="f-new"
        kicker="Home"
        title="Opens playing. In an order you can predict."
        shortTitle="Predictable, on purpose."
        short={
          <p className="m-0">
            Just saved, then what you haven’t seen, then more like what you keep. Every post says
            why it’s next.
          </p>
        }
        mock={
          <PhonePair
            shots={[
              {
                src: 'iphone-up-next',
                alt: 'ADHX on iPhone: Up next over Home. Just saved first, in the order it will play, each with whose save it is: Color palette inspiration, Aurora, the Audio-to-MIDI model playing now, Sound Lab, a synth that becomes whatever you type.',
              },
            ]}
          />
        }
        flip
        dark
      >
        <p className="m-0">
          Home plays the moment you open it: what your people saved since you last looked, then
          everything else you haven’t seen, newest first, then For you, more like what you keep.
          Every post says why it’s next; Up next shows the whole lineup. Videos and photos by
          default, text and articles when you want them. No guessing, no endless scroll.
        </p>
        <p className="m-0">
          Just want the latest? Switch Home to Everyone, Friends or Mine: the newest saves first,
          seen or not.
        </p>
      </Feature>

      <Feature
        id="f-channels"
        kicker="Channels"
        title="Rabbit holes, dug by your friends."
        short={
          <p className="m-0">
            Channels from everyone’s saves, named for what they’re about. Plus one per friend, with
            what’s new to you on top.
          </p>
        }
        mock={
          <WebShot
            src="web-channels"
            alt="ADHX Channels on the web: From everyone (Synths you can play, Pixel-art games, Plugins worth a look, Colour and type), Your people (Jo, Ben, Ana and Mum’s saves, with how many are new) and Made for you."
          />
        }
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
        short={
          <p className="m-0">
            See who’s watching with you, who saved the next one, and every “ha” as it floats past.
          </p>
        }
        mock={
          <PhonePair
            shots={[
              {
                src: 'iphone-live',
                alt: 'Tuned in to a Live moment on iPhone: LIVE, Pete watching with you, and Pete’s reaction, who sent this, floating up over a pixel-art game.',
              },
            ]}
          />
        }
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
        short={
          <p className="m-0">
            It signs a friend in and pairs their phone. No password for your mum to forget.
          </p>
        }
        mock={
          <PhonePair
            shots={[
              {
                src: 'iphone-connected',
                alt: 'ADHX on iPhone just after joining: This phone is connected. Connected to Pete’s ADHX, with you, Pete, Jo, Ben and one other, what your people saved this week, and Start watching.',
              },
            ]}
          />
        }
      >
        <p className="m-0">
          Send a friend one link: it signs them in and pairs their phone. No password, nothing for
          your mum to remember. Each link works once and runs out after a week, and you can approve
          anyone your friends invite before they’re in.
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
            <span className="md:hidden">
              Pick ADHX from any app’s share button. Watch in the full-screen player, then send the
              actual video to the group chat.
            </span>
            <span className="hidden md:inline">
              Hit share anywhere and pick ADHX. The post lands on your box, for your people or just
              for you. It plays in the same full-screen player, and Share sends the actual video to
              the group chat.
            </span>
          </p>
          <ul className="m-0 mt-1 hidden list-none flex-col gap-2.5 p-0 md:flex">
            {[
              'Save from any app’s share button',
              'The same full-screen player, one after another',
              'Send a post straight to a friend’s Home',
              'Home · Channels · Live, a tap apart',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-[16px] font-semibold">
                <Check size={18} className="shrink-0 text-nx-accent" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
            <a
              href="/install/"
              className="flex min-h-[52px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-nx-accent px-6 text-[16px] font-extrabold text-black hover:bg-white"
            >
              <Download size={20} />
              <span>Install the apps</span>
            </a>
            <p className="m-0 text-[13px] leading-[1.5] text-nx-muted md:text-[14px]">
              Not in the stores yet. Android installs from GitHub; iPhone through TestFlight when
              your ADHX offers it, or AltStore PAL or SideStore. No app? The web works too.
            </p>
          </div>
        </div>
        <PhonePair
          shots={[
            {
              src: 'android-home',
              alt: 'ADHX on Android: Home playing a video Mum saved, a pixel-art cat whose belly is a toy piano, from the game Offbeat, posted on X by @nexindie. Just saved, Not seen yet and For you along the top.',
            },
            {
              src: 'iphone-send',
              alt: 'Sending from ADHX on iPhone: the video itself, 540p, 219 KB. Send via WhatsApp, Copy, Files, Save to Photos, or straight to Pete, Jo, Ben or Mum.',
            },
          ]}
        />
      </div>
    </section>
  )
}

/* ——— The band ——— */

function Band() {
  return (
    <section aria-labelledby="band-title" className="relative overflow-hidden bg-black">
      <div className="absolute inset-0 md:relative md:inset-auto md:h-[300px] lg:absolute lg:inset-y-0 lg:left-[34%] lg:right-0 lg:h-auto">
        <PostMedia id="offbeat-room" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.6)_42%,#000_90%)] md:bg-[linear-gradient(180deg,transparent_0%,transparent_50%,#000_100%)] lg:bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.82)_26%,rgba(0,0,0,0.1)_52%,rgba(0,0,0,0.3)_100%)]" />
        <Credit
          id="offbeat-room"
          chip
          className="absolute left-4 top-4 md:left-auto md:right-4 lg:bottom-4 lg:top-auto"
        />
      </div>
      <span
        aria-hidden
        className="nx-float absolute right-4 top-[38px] flex h-11 items-center gap-2 rounded-[22px] bg-nx-cream pl-1.5 pr-4 text-[#141414] shadow-[0_14px_34px_rgba(0,0,0,0.45)] md:hidden"
      >
        <span className="absolute -bottom-1 left-5 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-nx-cream" />
        <Face who="ben" size={30} />
        <span className="whitespace-nowrap text-[14px] font-semibold">“you’re welcome”</span>
      </span>
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
          'relative flex min-h-[280px] flex-col justify-end gap-2.5 pb-7 pt-24 md:-mt-10 md:min-h-0 md:justify-start md:gap-4 md:pb-12 md:pt-0 lg:mt-0 lg:min-h-[360px] lg:justify-center lg:gap-[18px] lg:py-12',
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
          <span>No streaks, no like counts, no strangers.</span>
          <span className="hidden md:inline"> Just your lot, and whatever Ben found today.</span>
        </p>
      </div>
    </section>
  )
}

/* ——— Self-host ——— */

const SPECS: Array<[string, string]> = [
  ['Runs on', 'Anything with Docker, amd64 or arm64'],
  ['Memory', '4 GB is comfortable; 2 GB with speech and screen text off. No GPU'],
  ['Disk', 'Roughly 10–30 GB per 1,000 saves'],
  ['First start', 'Fetches the search models (about 800 MB) in the background'],
  ['Your data', 'One /data folder. Stop ADHX and copy it to back up'],
  ['Updates', 'Pull the new image, or run the installer again'],
]

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
          'grid items-start gap-6 pb-10 pt-8 md:gap-10 md:py-16 lg:grid-cols-[minmax(0,516fr)_minmax(0,620fr)] lg:gap-16',
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
          <p className="m-0 text-[15px] leading-[1.45] text-nx-soft md:text-[18px] md:leading-[1.55]">
            ADHX isn’t a service you sign up to. It’s one container you run for the people you’d
            actually let in your house, and everything it keeps is a folder you own.
          </p>
          <dl className="m-0 mt-1 grid grid-cols-1 overflow-hidden rounded-[18px] border border-white/10 sm:grid-cols-2">
            {SPECS.map(([term, detail]) => (
              <div
                key={term}
                className="flex flex-col gap-0.5 border-t border-white/10 px-4 py-3 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:odd:border-r"
              >
                <dt className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-nx-accent">
                  {term}
                </dt>
                <dd className="m-0 text-[14px] leading-snug text-nx-cream md:text-[15px]">
                  {detail}
                </dd>
              </div>
            ))}
          </dl>
          <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0 text-[14px] leading-[1.45] text-nx-soft md:text-[15px]">
            {[
              'Put it behind your reverse proxy, or keep it on Tailscale or your home network.',
              'Rather not read the guides? Point your AI coding agent at the repo. It knows how to set ADHX up.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <Dot className="mt-[7px] h-1.5 w-1.5" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-3 md:gap-4 lg:sticky lg:top-24">
          <CopyCommand text={SETUP} title="Try it in a minute" note="anywhere with Docker" />
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <a href={`${GITHUB_URL}#one-click-wherever-you-host`} className={cn(PRIMARY, 'flex-1')}>
              <span>Every way to install</span>
              <Arrow size={18} />
            </a>
            <StarButton className="min-h-[52px] px-6 text-[16px]" />
          </div>
          <p className="m-0 text-[13px] leading-[1.5] text-nx-muted md:text-[14px]">
            A Linux installer with HTTPS, Render, Railway, Fly, Portainer, CapRover, Unraid, Umbrel
            and UGREEN, plus paste-in Compose for Synology, TrueNAS, Coolify, Dokploy and CasaOS.
          </p>
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
        <Friends />
        <GroupChat />
        <Features />
        <AiSection />
        <SelfHost />
        <AdminSection />
        <Apps />
        <Band />
        <Faq />
        <Closer />
      </main>
      <Footer />
    </div>
  )
}

/* ——— The last word ——— */

function Closer() {
  return (
    <section aria-labelledby="closer-title" className="border-t border-white/10 bg-black">
      <div
        className={cn(
          WRAP,
          'flex flex-col items-start gap-4 py-12 md:items-center md:gap-6 md:py-20 md:text-center',
        )}
      >
        <Gob size={56} />
        <h2
          id="closer-title"
          className="m-0 font-nx-serif text-[40px] font-normal leading-[0.95] tracking-[-0.015em] md:text-[64px] lg:text-[72px]"
        >
          <span className="block md:inline">Bring your people. </span>
          <span className="block text-nx-accent md:inline">Leave the algorithm.</span>
        </h2>
        <p className="m-0 max-w-[560px] text-[15px] leading-[1.45] text-nx-soft md:text-[18px] md:leading-[1.55]">
          Look around the demo as Sam, or have your own running before the kettle boils.
        </p>
        <Ctas className="w-full sm:w-auto md:justify-center" />
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-nx-muted md:justify-center md:text-[14px]">
          <StarButton className="min-h-[40px]" />
          <span>{`MIT licence · ${RELEASE} · a star helps other people find it`}</span>
        </p>
      </div>
    </section>
  )
}

/** The footer, shared with the install page. */
export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black">
      <div
        className={cn(
          WRAP,
          'flex flex-col gap-2.5 py-[23px] md:min-h-[111px] md:flex-row md:items-center md:gap-[18px] md:py-6',
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
        <nav
          aria-label="Footer"
          className="-my-[13px] flex flex-wrap gap-x-[22px] gap-y-1 md:my-0 md:gap-7"
        >
          {[
            { href: DEMO_URL, label: 'Live demo' },
            { href: '/install/', label: 'Phone apps' },
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
      <div className={cn(WRAP, 'pb-6 md:pb-7')}>
        <p className="m-0 border-t border-white/10 pt-4 text-[12px] leading-[1.7] text-nx-muted md:text-[13px]">
          <span>The posts shown are real saves, each from its original poster: </span>
          {creditedPosts().map((p, i, all) => (
            <span key={p.url}>
              <span className="whitespace-nowrap">
                <a
                  href={p.url}
                  className="inline-flex min-h-[24px] items-center gap-1 font-semibold text-nx-soft underline-offset-2 hover:text-white hover:underline"
                >
                  <NetworkIcon platform={p.network} className="h-3 w-3" />
                  <span>{`@${p.author}`}</span>
                  <span className="sr-only">{` on ${networkLabel(p.network)}`}</span>
                </a>
                <span>{i < all.length - 1 ? ',' : '.'}</span>
              </span>
              {i < all.length - 1 && <span> </span>}
            </span>
          ))}
        </p>
      </div>
    </footer>
  )
}
