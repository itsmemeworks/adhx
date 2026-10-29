import type { ReactNode } from 'react'
import { cn } from './cn'
import { Kicker, Dot, WRAP } from './ProductSite'

/**
 * "Run it from one page": the admin area, with a drawing of Admin → System
 * (the app's map of the server, the Mac helper and the outside services).
 * A still picture with made-up numbers, not a screenshot.
 */

const GOOD = '#7ddc8a'
const WARN = '#ffb59a'
const FAINT = '#a89f8d'

function Light({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden
      className="block h-2 w-2 shrink-0 rounded-full"
      style={{ background: colour }}
    />
  )
}

function Tile({ colour, title, sub }: { colour: string; title: string; sub: string }) {
  return (
    <span className="flex min-w-0 items-start gap-2 rounded-[12px] bg-white/[0.06] px-2.5 py-2">
      <span className="mt-[5px]">
        <Light colour={colour} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[12px] font-extrabold text-nx-cream">{title}</span>
        <span className="truncate text-[11px] text-nx-muted">{sub}</span>
      </span>
    </span>
  )
}

function Queue({ title, left, colour }: { title: string; left: string; colour: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 rounded-[12px] bg-white/[0.06] px-2.5 py-2">
      <span className="text-[11px] leading-tight text-nx-muted">{title}</span>
      <span className="text-[20px] font-extrabold leading-none" style={{ color: colour }}>
        {left}
      </span>
    </span>
  )
}

function Box({
  colour,
  title,
  sub,
  badge,
  children,
}: {
  colour: string
  title: string
  sub: string
  badge?: string
  children: ReactNode
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-2.5 rounded-[16px] border-2 p-3"
      style={{ borderColor: colour }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-[6px]">
          <Light colour={colour} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-extrabold text-nx-cream">{title}</span>
          <span className="truncate text-[11px] text-nx-muted">{sub}</span>
        </span>
        {badge && (
          <span className="ml-auto shrink-0 rounded-full bg-nx-accent/[0.14] px-2 py-0.5 text-[10px] font-extrabold text-nx-accent">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

/** A drawing of Admin → System. */
function SystemDrawing() {
  return (
    <figure
      className="m-0 flex flex-col gap-3 rounded-[22px] border border-white/10 bg-nx-surface p-3.5 md:p-4"
      aria-label="Admin → System in ADHX: a UGREEN NAS running the web app, the download loop and the search process, with 3 posts left to keep and 12 to understand; a connected Mac mini doing 2 jobs with 12 waiting; Jev, email, FxTwitter and yt-dlp working and Sentry off."
    >
      <div className="flex items-center gap-2 rounded-[14px] border border-white/10 px-3 py-2">
        <Light colour={GOOD} />
        <span className="text-[14px] font-extrabold text-nx-cream">Everything is working</span>
        <span className="ml-auto text-[11px] text-nx-muted">Checked just now</span>
      </div>
      <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(0,1.5fr)_56px_minmax(0,1fr)] sm:gap-0">
        <Box
          colour={GOOD}
          title="UGREEN NAS"
          sub="Intel N100 · 4 cores · in Docker"
          badge="This server"
        >
          <div className="grid grid-cols-2 gap-1.5">
            <Tile colour={GOOD} title="Web app" sub="0.6 GB memory" />
            <Tile colour={GOOD} title="Download loop" sub="Running" />
            <Tile colour={GOOD} title="Search process" sub="Running" />
            <Tile colour={FAINT} title="Understanding" sub="On the Mac" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Queue title="Keeping copies" left="3" colour={GOOD} />
            <Queue title="Converting" left="1" colour={GOOD} />
            <Queue title="Understanding" left="12" colour={GOOD} />
          </div>
        </Box>
        <div className="relative flex h-8 items-center justify-center sm:h-auto" aria-hidden>
          <span
            className="absolute left-1/2 top-0 h-full w-0.5 sm:left-0 sm:top-1/2 sm:h-0.5 sm:w-full"
            style={{ background: GOOD }}
          />
        </div>
        <Box colour={GOOD} title="Mac helper" sub="Connected">
          <Tile colour={GOOD} title="mac-mini" sub="2 jobs now · video, speech" />
          <span className="text-[11px] leading-snug text-nx-muted">
            12 waiting for it · converts videos and understands pictures, video, speech and text on
            screen
          </span>
        </Box>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <Tile colour={GOOD} title="Jev" sub="answered 2 min ago" />
        <Tile colour={GOOD} title="Email" sub="sign-in links" />
        <Tile colour={GOOD} title="FxTwitter" sub="X post details" />
        <Tile colour={GOOD} title="yt-dlp" sub="2026.10.22" />
        <Tile colour={WARN} title="X" sub="last sync failed" />
        <Tile colour={FAINT} title="Sentry" sub="Off" />
      </div>
      <figcaption className="text-[11px] text-nx-muted">
        Admin → System, with made-up numbers.
      </figcaption>
    </figure>
  )
}

export function AdminSection() {
  return (
    <section
      id="admin"
      aria-labelledby="admin-title"
      className="scroll-mt-16 border-t border-white/10"
    >
      <div
        className={cn(
          WRAP,
          'grid items-center gap-5 pb-10 pt-8 md:gap-10 md:py-16 lg:grid-cols-[minmax(0,516fr)_minmax(0,620fr)] lg:gap-16',
        )}
      >
        <div className="flex flex-col gap-2.5 md:gap-4">
          <Kicker>Admin</Kicker>
          <h2
            id="admin-title"
            className="m-0 font-nx-serif text-[34px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[48px] lg:text-[56px]"
          >
            Is it working? One page says.
          </h2>
          <p className="m-0 text-[15px] leading-[1.45] text-nx-soft md:text-[18px] md:leading-[1.55]">
            Whoever sets ADHX up runs it from Admin. System draws your setup, from the NAS and the
            optional Mac helper to every outside service, each lit green, amber or red. It says
            what’s wrong in plain words.
          </p>
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-2 p-0 text-[15px] leading-[1.4] text-nx-cream md:gap-3 md:text-[16px] md:leading-[1.45]">
            {[
              'Every queue: what’s waiting, what’s working, what failed, and how fast it’s going.',
              'The Mac helper: connected or not, and why it was turned away.',
              'Switch on extras you missed at setup (smarter search, email, X) without touching config.',
              'Let people in, make invite links, pause the work, hide a post. Every action is logged.',
            ].map((line) => (
              <li key={line} className="flex gap-2.5 md:gap-3">
                <Dot className="mt-[7px] h-1.5 w-1.5 md:mt-2 md:h-[7px] md:w-[7px]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto w-full min-w-0 max-w-[620px]">
          <SystemDrawing />
        </div>
      </div>
    </section>
  )
}
