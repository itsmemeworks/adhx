import type { ReactNode } from 'react'
import { cn } from './cn'
import { Gob } from './Gob'
import { Face, Faces, PEOPLE, type PersonId } from './People'
import { Credit, PostMedia, post as postOf, type PostId } from './Post'
import { Ring, Toggle } from './frames'
import {
  Bookmark,
  Check,
  Dots,
  Heart,
  LinkIcon,
  Lock,
  Search,
  Screen,
  Send,
  Together,
  Upload,
  Video,
} from './icons'

/**
 * The product site's feature mockups, with real posts saved on an ADHX server
 * (components/Post.tsx), each credited with its network's mark and its
 * author's handle. Each is a figure: the drawing is hidden from screen
 * readers and described by a visually hidden caption. Below `md` they follow
 * the phone board (compact); from `md` the desktop one.
 */

export function Mock({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <figure className={cn('m-0 min-w-0', className)}>
      <div aria-hidden>{children}</div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  )
}

function Tile({
  post,
  still,
  credit,
  className,
  children,
}: {
  post: PostId
  still?: boolean
  credit?: 'tl' | 'tr' | 'bl' | 'br'
  className?: string
  children?: ReactNode
}) {
  return (
    <PostMedia
      id={post}
      still={still}
      credit={credit}
      className={cn('relative block overflow-hidden bg-nx-surface', className)}
    >
      {children}
    </PostMedia>
  )
}

const card = 'border border-white/10 bg-nx-surface'

/* ——— New ——— */

function WhyRow({
  post,
  title,
  why,
  icon,
  active = false,
  className,
}: {
  post: PostId
  title: string
  why: string
  icon: ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 rounded-[12px] p-[5px] md:gap-3 md:rounded-[16px] md:p-2',
        active && 'bg-[#262320]',
        className,
      )}
    >
      <Tile
        post={post}
        still
        className="h-[46px] w-[34px] shrink-0 rounded-[8px] md:h-[60px] md:w-[44px] md:rounded-[10px]"
      />
      <span className="flex min-w-0 flex-col gap-[2px] md:gap-[3px]">
        <span
          className={cn(
            'truncate text-[12px] md:text-[14px]',
            active ? 'font-extrabold' : 'font-semibold',
          )}
        >
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-nx-soft md:text-[12px]">
          <span className="shrink-0 text-nx-accent">{icon}</span>
          <span className="truncate">{why}</span>
        </span>
        <Credit id={post} className="text-[10px] text-nx-muted md:text-[11px]" />
      </span>
    </span>
  )
}

function KindChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] md:h-8 md:px-3 md:text-[13px]',
        on
          ? 'bg-nx-cream font-extrabold text-black'
          : 'border border-white/20 font-semibold text-nx-soft',
      )}
    >
      {on && <Check size={11} />}
      <span>{label}</span>
    </span>
  )
}

function KindChips({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-[5px] md:gap-1.5', className)}>
      <KindChip label="Videos" on />
      <KindChip label="Photos" on />
      <KindChip label="Text" on={false} />
      <KindChip label="Articles" on={false} />
    </div>
  )
}

export function NewMock() {
  return (
    <Mock label="The New list, showing videos and photos, with why each post is next: the pixel-art music game Offbeat by @nexindie, saved together; stills from the film Sorcerer by @CinemaTweets1, close to you, from Mum; the RC808 drum synth by @XWAVEart, like the synths you kept. It ends on Gob: You're all caught up. Go touch grass.">
      <div
        className={cn(
          card,
          'flex flex-col gap-2.5 rounded-[22px] p-3 md:flex-row md:gap-4 md:rounded-[28px] md:p-5',
        )}
      >
        <KindChips className="md:hidden" />
        <div className="flex gap-2.5 md:contents">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 md:gap-3">
            <div className="hidden items-baseline justify-between gap-3 md:flex">
              <span className="font-nx-serif text-[34px] leading-none">New</span>
              <span className="whitespace-nowrap text-[13px] font-semibold text-nx-soft">
                3 you haven’t seen
              </span>
            </div>
            <KindChips className="hidden md:flex" />
            <div className="flex flex-col gap-1.5 md:gap-1">
              <WhyRow
                post="offbeat"
                title="Pixel-art music tycoon game ‘Offbeat’"
                why="Saved together"
                icon={<Together size={12} />}
                active
              />
              <WhyRow
                post="sorcerer"
                title="Sorcerer might be one of the best films I’ve ever seen"
                why="Close to you · Mum"
                icon={<Heart size={12} />}
              />
              <WhyRow
                post="rc808"
                title="The lost RC808 drum synthesis software"
                why="Like the synths you kept"
                icon={<Bookmark size={12} />}
                className="hidden md:flex"
              />
            </div>
          </div>
          <div className="relative flex w-[42%] min-w-[116px] max-w-[146px] shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-[14px] border border-white/10 bg-nx-ink p-2.5 text-center md:max-w-[252px] md:gap-0 md:rounded-[22px] md:px-5 md:py-6">
            <span className="pointer-events-none absolute -left-[60px] -top-2.5 hidden h-[260px] w-[372px] rounded-full bg-[radial-gradient(rgba(255,210,63,0.14),rgba(255,210,63,0)_65%)] md:block" />
            <Gob size={36} className="relative md:hidden" />
            <span className="relative hidden flex-col items-center md:flex">
              <Gob size={72} className="drop-shadow-[0_14px_30px_rgba(255,210,63,0.18)]" />
              <span className="mt-2 h-1.5 w-[54px] rounded-[50%] bg-black/70" />
            </span>
            <span className="relative font-nx-serif text-[16px] leading-[0.95] min-[360px]:text-[18px] md:mt-3.5 md:text-[32px]">
              <span className="block whitespace-nowrap md:whitespace-normal">
                You’re all <br className="md:hidden" />
                caught up.
              </span>
              <span className="block whitespace-nowrap text-nx-accent">Go touch grass.</span>
            </span>
            <span className="relative mt-2.5 hidden text-[13px] leading-[1.4] text-nx-soft md:block">
              That’s everything since you last looked.
            </span>
            <span className="relative mt-4 hidden h-10 w-full items-center justify-center whitespace-nowrap rounded-full bg-nx-accent text-[14px] font-extrabold text-black md:flex">
              Browse channels
            </span>
          </div>
        </div>
      </div>
    </Mock>
  )
}

/* ——— Saver faces and Just for me ——— */

export function FacesMock() {
  return (
    <Mock label="A video of pink and violet waves rippling across an audio plugin, posted on X by @sudara, saved by Ana and Ben. Next to it the save card: shared with your people, with a Just for me switch.">
      <div className="flex items-stretch gap-3 md:items-center md:gap-5">
        <Tile
          post="sudara"
          className="h-[200px] w-[46%] shrink-0 rounded-[20px] md:h-[380px] md:w-[44%] md:rounded-[24px]"
        >
          <span className="nx-scrim absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-2.5 pb-2.5 pt-8 md:gap-2 md:px-3.5 md:pb-4">
            <span className="flex flex-col items-start gap-1.5 md:flex-row md:items-center md:gap-2">
              <Faces who={['ana', 'ben']} size={24} />
              <span className="text-[12px] font-extrabold leading-tight min-[360px]:whitespace-nowrap md:text-[14px]">
                Ana and Ben saved this
              </span>
            </span>
            <Credit id="sudara" className="text-[11px] text-nx-soft md:text-[13px]" />
          </span>
        </Tile>
        <span
          className={cn(
            card,
            'flex min-w-0 flex-1 flex-col gap-2.5 rounded-[20px] p-3 shadow-[0_30px_70px_rgba(0,0,0,0.5)] md:gap-3.5 md:rounded-[24px] md:p-5',
          )}
        >
          <span className="flex items-center gap-2 md:gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nx-accent text-black md:h-8 md:w-8">
              <Check size={14} />
            </span>
            <span className="truncate text-[15px] font-extrabold md:text-[17px]">
              <span className="md:hidden">Saved</span>
              <span className="hidden md:inline">Saved to your ADHX</span>
            </span>
          </span>
          <span className="hidden items-center gap-3 rounded-[16px] bg-black p-2 md:flex">
            <Tile post="sudara" still className="h-11 w-11 shrink-0 rounded-[10px]" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[14px] font-extrabold">
                working on “additive saturation” for v28
              </span>
              <Credit id="sudara" className="text-[12px] text-nx-muted" />
            </span>
          </span>
          <span className="hidden h-px bg-white/10 md:block" />
          <span className="hidden text-[11px] font-extrabold uppercase tracking-[0.1em] text-nx-muted md:block">
            Who sees it
          </span>
          <span className="flex min-w-0 items-center gap-2 md:gap-2.5">
            <Faces who={['ana', 'ben', 'mum', 'jo']} size={22} ring="#1a1814" />
            <span className="truncate text-[12px] font-semibold md:text-[14px]">
              <span className="md:hidden">Your people</span>
              <span className="hidden md:inline">Shared with your people</span>
            </span>
          </span>
          <span className="flex items-center gap-2 rounded-[14px] bg-[#262320] p-2.5 md:gap-3 md:rounded-[18px] md:px-3.5 md:py-3">
            <Lock size={20} className="hidden shrink-0 text-nx-soft md:block" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] font-extrabold md:text-[15px]">
                Just for me
              </span>
              <span className="hidden truncate text-[12px] text-nx-muted md:block">
                Only you will see it
              </span>
            </span>
            <Toggle width={40} height={24} />
          </span>
          <span className="truncate text-[11px] text-nx-muted md:hidden">Only you will see it</span>
        </span>
      </div>
    </Mock>
  )
}

/* ——— The meme vault ——— */

function FileRow({
  post,
  name,
  detail,
  compactDetail,
  className,
}: {
  post: PostId
  name: string
  detail: string
  compactDetail?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex h-[52px] items-center gap-2.5 rounded-[12px] border border-white/10 bg-nx-surface p-1.5 md:h-14 md:gap-3 md:rounded-[14px] md:border-0 md:bg-black md:p-2',
        className,
      )}
    >
      <Tile
        post={post}
        still
        className="h-[38px] w-[38px] shrink-0 rounded-[9px] md:h-10 md:w-10 md:rounded-[10px]"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-mono text-[12px] md:text-[13px]">{name}</span>
        <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-nx-muted md:text-[12px]">
          <span className={cn('shrink-0', compactDetail && 'hidden md:inline')}>{detail}</span>
          {compactDetail && <span className="shrink-0 md:hidden">{compactDetail}</span>}
          <span className="shrink-0">·</span>
          <Credit id={post} />
        </span>
      </span>
    </span>
  )
}

export function VaultMock() {
  return (
    <Mock label="A video kept on your ADHX: one website trying on colour palette after colour palette, posted on X by @AdhamDannaway. It plays from your own box, whatever happens on X. Next to it, the kept files on your server: that video, the four full-size Sorcerer photos by @CinemaTweets1, a 4K video by @davidhaz and a 2160p one by @dharmaone, and a Send the video button.">
      <div className="flex gap-3 md:gap-5">
        <span className="flex w-[46%] shrink-0 flex-col overflow-hidden rounded-[20px] bg-nx-surface md:w-[40%] md:rounded-[24px]">
          <Tile post="palettes" className="h-[150px] md:h-[300px]">
            <span className="absolute left-2 top-2 inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full bg-nx-accent px-2 text-[11px] font-extrabold text-black shadow-[0_4px_12px_rgba(0,0,0,0.35)] md:left-2.5 md:top-2.5 md:h-7 md:gap-1.5 md:px-2.5 md:text-[12px]">
              <Check size={12} />
              <span>Kept on your ADHX</span>
            </span>
          </Tile>
          <span className="flex flex-col gap-1 px-2.5 py-2.5 md:gap-1.5 md:px-3.5 md:py-3">
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#5ee38a]" />
              <span className="truncate text-[12px] font-extrabold md:text-[13px]">
                <span className="md:hidden">Yours to keep</span>
                <span className="hidden md:inline">Plays from your box</span>
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-nx-soft md:text-[12px]">
              <Credit id="palettes" />
              <span className="hidden md:inline">· whatever X does</span>
            </span>
          </span>
        </span>
        <span
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-2 md:rounded-[24px] md:border md:border-white/10 md:bg-nx-surface md:p-4',
          )}
        >
          <span className="hidden items-center justify-between gap-3 px-1 md:flex">
            <span className="font-mono text-[13px] text-nx-muted">/data/media</span>
            <span className="whitespace-nowrap text-[12px] font-extrabold text-nx-soft">
              On your box
            </span>
          </span>
          <FileRow
            post="palettes"
            name="video-1.mp4"
            detail="1380 × 1080 video"
            compactDetail="1380 × 1080"
          />
          <FileRow
            post="sorcerer"
            name="photo-1.jpg … photo-4.jpg"
            detail="Full-size album"
            className="hidden md:flex"
          />
          <FileRow
            post="soundlab"
            name="video-1.mp4"
            detail="3840 × 2160 video"
            compactDetail="4K"
          />
          <FileRow
            post="modular"
            name="video-1.mp4"
            detail="3344 × 2160 video"
            className="hidden md:flex"
          />
          <span className="flex-1" />
          <span className="flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-nx-accent text-[14px] font-extrabold text-black md:text-[15px]">
            <Upload size={16} />
            <span>Send the video</span>
          </span>
        </span>
      </div>
    </Mock>
  )
}

/* ——— Search ——— */

function Query({ text, caret = false }: { text: string; caret?: boolean }) {
  return (
    <span className="flex h-9 min-w-0 items-center gap-2 rounded-full bg-nx-surface px-3 text-[13px] md:h-12 md:gap-2.5 md:bg-black md:px-4 md:text-[15px]">
      <Search size={16} className="shrink-0 text-nx-accent" />
      <span className="truncate">{text}</span>
      {caret && <span className="-ml-1 h-4 w-0.5 shrink-0 bg-nx-accent md:h-[18px]" />}
    </span>
  )
}

function Match({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full border border-white/15 bg-black/60 px-2.5 text-[11px] font-extrabold md:h-[30px] md:text-[12px]">
      <span className="text-nx-accent">{icon}</span>
      <span>{label}</span>
    </span>
  )
}

/** How a search hit matched, over the post: the chip at the top, the words at the bottom. */
function MatchOver({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <>
      <span className="absolute left-2 top-2 md:left-2.5 md:top-2.5">
        <Match icon={icon} label={label} />
      </span>
      <span className="nx-scrim absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-5 md:px-3 md:pb-2.5">
        {children}
      </span>
    </>
  )
}

/** The post's own words, when the match isn't in them. */
function Words({ text, note }: { text: string; note: string }) {
  return (
    <span className="flex flex-col text-[12px] font-semibold leading-snug md:text-[15px]">
      <span className="truncate">{text}</span>
      <span className="text-[11px] font-bold text-nx-accent md:text-[12px]">{note}</span>
    </span>
  )
}

function Hit({ before, hit, after }: { before: string; hit: string; after: string }) {
  return (
    <span className="text-[12px] font-semibold leading-snug md:text-[15px]">
      <span>{before}</span>
      <mark className="rounded-[4px] bg-nx-accent px-[3px] font-extrabold text-black">{hit}</mark>
      <span>{after}</span>
    </span>
  )
}

export function SearchMock() {
  return (
    <Mock label="Two searches. piano cat finds Offbeat, a pixel-art music game posted on X by @nexindie, by what's in the video: its words never mention a cat. audio to midi finds a video by @MireloAI by the words on screen: Audio-to-MIDI.">
      <div className="grid grid-cols-2 gap-3 md:gap-4 md:rounded-[28px] md:border md:border-white/10 md:bg-nx-surface md:p-5">
        <span className="flex min-w-0 flex-col gap-2 md:gap-2.5">
          <Query text="piano cat" caret />
          <Tile
            post="offbeat"
            className="h-[160px] rounded-[16px] ring-2 ring-nx-accent md:h-[230px] md:rounded-[18px] md:ring-[3px]"
          >
            <MatchOver icon={<Video size={12} />} label="In the video">
              <Words text="“Pixel-art music tycoon game…”" note="No cat in the words" />
            </MatchOver>
          </Tile>
          <span className="flex min-w-0 items-center gap-2">
            <Face who="ben" size={20} className="hidden md:inline-flex" />
            <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-nx-muted md:text-[12px]">
              <span className="hidden md:inline">Ben saved this ·</span>
              <Credit id="offbeat" />
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-2 md:gap-2.5">
          <Query text="audio to midi" />
          <Tile post="midi" className="h-[160px] rounded-[16px] md:h-[230px] md:rounded-[18px]">
            <MatchOver icon={<Screen size={12} />} label="On screen">
              <Hit before="“" hit="Audio-to-MIDI" after="”" />
            </MatchOver>
          </Tile>
          <span className="flex min-w-0 items-center gap-2">
            <Face who="mum" size={20} className="hidden md:inline-flex" />
            <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-nx-muted md:text-[12px]">
              <span className="hidden md:inline">Mum saved this ·</span>
              <Credit id="midi" />
            </span>
          </span>
        </span>
      </div>
    </Mock>
  )
}

/* ——— Channels ——— */

function ChannelCard({
  name,
  posts,
  savers,
  count,
}: {
  name: string
  posts: PostId[]
  savers: PersonId[]
  count: string
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5 md:rounded-[24px] md:border md:border-white/10 md:bg-nx-surface md:p-3">
      <span className="grid h-[82px] grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-[12px] md:h-[190px] md:gap-1.5">
        {posts.map((p) => (
          <Tile key={p} post={p} still className="md:rounded-[6px]" />
        ))}
      </span>
      <span className="truncate text-[13px] font-extrabold md:mt-1.5 md:px-1 md:text-[16px]">
        {name}
      </span>
      <span className="truncate text-[10px] text-nx-muted md:px-1 md:text-[11px]">
        {posts.map((p) => `@${postOf(p).author}`).join(' · ')}
      </span>
      <span className="hidden min-w-0 items-center gap-2 px-1 md:flex">
        <Faces who={savers} size={20} ring="#1a1814" />
        <span className="truncate text-[13px] text-nx-muted">{count}</span>
      </span>
    </span>
  )
}

export function ChannelsMock() {
  const friends: Array<{ who: PersonId; n: number }> = [
    { who: 'ana', n: 6 },
    { who: 'ben', n: 3 },
    { who: 'mum', n: 12 },
    { who: 'jo', n: 2 },
  ]
  return (
    <Mock label="Two channels made from everyone's saves: Synths with too many cables, with posts on X by @dharmaone, @XWAVEart, @joecroskey and @itsCP666, and Websites that show off, with posts by @VanhDesign, @AdhamDannaway, @cabralorenzo and @nutlope. Then a channel for each friend with how many are new to you: Ana 6, Ben 3, Mum 12, Jo 2.">
      <div className="flex flex-col gap-2.5 md:gap-4">
        <span className="grid grid-cols-2 gap-3 md:gap-4">
          <ChannelCard
            name="Synths with too many cables"
            posts={['modular', 'rc808', 'aurora', 'okinstruments']}
            savers={['jo', 'ana', 'ben']}
            count="14 posts · 2 new"
          />
          <ChannelCard
            name="Websites that show off"
            posts={['wallow', 'palettes', 'bencho', 'hallmark']}
            savers={['you', 'ben', 'mum']}
            count="23 posts · 5 new"
          />
        </span>
        <span
          className={cn(
            card,
            'flex flex-col gap-2.5 rounded-[16px] px-2.5 py-2.5 md:rounded-[22px] md:px-4 md:py-3.5',
          )}
        >
          <span className="hidden text-[11px] font-extrabold uppercase tracking-[0.1em] text-nx-muted md:block">
            Your people
          </span>
          <span className="grid grid-cols-5 items-center gap-1 md:gap-2">
            {friends.map((f) => (
              <span
                key={f.who}
                className="flex min-w-0 flex-col items-center gap-1 md:flex-row md:gap-2.5"
              >
                <Face who={f.who} size={28} className="md:!h-9 md:!w-9 md:!text-[15px]" />
                <span className="flex min-w-0 flex-col whitespace-nowrap text-[11px] md:text-[14px]">
                  <span>
                    <span className="font-extrabold">{PEOPLE[f.who].name}</span>
                    <span className="font-extrabold text-nx-accent md:hidden">{` · ${f.n}`}</span>
                  </span>
                  <span className="hidden text-[12px] font-extrabold text-nx-accent md:inline">
                    {`${f.n} new`}
                  </span>
                </span>
              </span>
            ))}
            <span className="flex min-w-0 flex-col items-center gap-1 md:flex-row md:gap-2.5">
              <Face who="you" size={28} className="md:!h-9 md:!w-9 md:!text-[15px]" />
              <span className="flex min-w-0 flex-col whitespace-nowrap text-[11px] md:text-[14px]">
                <span className="font-extrabold">You</span>
                <span className="hidden text-[12px] text-nx-muted md:inline">38 saves</span>
              </span>
            </span>
          </span>
        </span>
      </div>
    </Mock>
  )
}

/* ——— Live ——— */

function Reaction({
  who,
  text,
  fade = 1,
  delay = 0,
  hot = false,
  className,
}: {
  who: PersonId
  text: string
  fade?: number
  delay?: number
  hot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'nx-float inline-flex h-8 items-center gap-2 self-start whitespace-nowrap rounded-full bg-black/60 pl-1 pr-3 text-[13px] font-extrabold backdrop-blur-md md:h-10 md:pr-4 md:text-[15px]',
        hot
          ? 'border-[1.5px] border-[#ff8fa3]/70 shadow-[0_10px_24px_rgba(0,0,0,0.4)]'
          : 'border border-white/15',
        className,
      )}
      style={{ opacity: fade, animationDelay: `${delay}ms` }}
    >
      <Face who={who} size={24} className="md:!h-[30px] md:!w-[30px] md:!text-[12px]" />
      <span>{text}</span>
    </span>
  )
}

export function LiveMock() {
  return (
    <Mock label="Live: you, Ana and Jo watching a video Ben saved, a modular synth with patch cables everywhere, posted on X by @dharmaone. Reactions float up: who sent this, again, ha. Mum's save, the Sorcerer stills by @CinemaTweets1, slides in as playing next.">
      <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-nx-ink md:rounded-[28px]">
        <PostMedia
          id="modular"
          still
          className="absolute -inset-10 h-[calc(100%+80px)] w-[calc(100%+80px)]"
          style={{ filter: 'blur(36px) brightness(0.32)' }}
        />
        <div className="relative flex gap-3 p-2.5 md:gap-4 md:p-4">
          {/* The video */}
          <Tile
            post="modular"
            className="h-[156px] w-[90px] shrink-0 rounded-[14px] shadow-[0_0_0_2px_rgba(127,209,174,0.5)] md:order-2 md:h-[348px] md:w-[34%] md:rounded-[20px]"
          >
            <span className="absolute inset-x-0 bottom-0 nx-scrim flex flex-col gap-1 px-1.5 pb-1.5 pt-4 md:gap-1.5 md:px-3 md:pb-3.5 md:pt-6">
              <span className="hidden min-w-0 items-center gap-1.5 md:flex">
                <Face who="ben" size={20} ring="#000" />
                <span className="truncate text-[11px] font-extrabold md:text-[12px]">
                  Ben saved this
                </span>
              </span>
              <Credit id="modular" className="text-[9px] text-nx-soft md:text-[11px]" />
              <span className="h-[3px] rounded bg-white/25">
                <span className="block h-full w-[62%] rounded bg-nx-accent" />
              </span>
            </span>
          </Tile>
          {/* Who's here and what they're saying */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 md:order-1 md:w-[30%] md:flex-none md:gap-3">
            <span className="inline-flex h-[26px] items-center gap-2 self-start rounded-full border border-[#ff5a3c]/50 bg-black/55 px-2.5 text-[11px] font-extrabold tracking-[0.08em] md:h-8 md:px-3 md:text-[12px]">
              <span className="nx-pulse h-2 w-2 rounded-full bg-[#ff5a3c]" />
              <span>LIVE</span>
            </span>
            <span className="flex items-center gap-2 md:flex-col md:items-start md:rounded-[18px] md:border md:border-white/10 md:bg-black/50 md:p-3">
              <span className="flex shrink-0 items-center gap-1">
                <Face
                  who="ana"
                  size={24}
                  ring="#111"
                  style={{ boxShadow: '0 0 0 2px #111, 0 0 0 3.5px #5ee38a' }}
                />
                <Face
                  who="jo"
                  size={24}
                  ring="#111"
                  style={{ marginLeft: 3, boxShadow: '0 0 0 2px #111, 0 0 0 3.5px #5ee38a' }}
                />
              </span>
              <span className="text-[12px] leading-snug min-[360px]:whitespace-nowrap md:whitespace-normal md:text-[13px]">
                <span className="font-extrabold">Ana and Jo</span>
                <span className="text-nx-soft"> are watching</span>
                <span className="hidden text-nx-soft md:inline"> with you</span>
              </span>
            </span>
            <span className="mt-auto flex flex-col gap-1.5 md:gap-2">
              <Reaction
                who="jo"
                text="who sent this"
                fade={0.4}
                delay={0}
                className="hidden md:inline-flex"
              />
              <Reaction who="ana" text="again" fade={0.7} delay={600} />
              <Reaction who="you" text="ha" hot delay={1200} />
            </span>
          </div>
          {/* Up next, on phones */}
          <span className="absolute bottom-3 right-2.5 hidden h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#ffb35c]/45 bg-nx-surface/90 pl-1 pr-3 text-[12px] min-[360px]:flex md:!hidden">
            <Tile post="sorcerer" still className="h-7 w-7 rounded-full" />
            <span>
              <span className="font-extrabold">Mum’s</span>
              <span className="text-nx-soft"> is next</span>
            </span>
          </span>
          {/* Up next and Say something */}
          <div className="hidden min-w-0 flex-1 flex-col justify-between gap-3 md:order-3 md:flex">
            <span className="flex items-center gap-2.5 rounded-[18px] border border-[#ffb35c]/45 bg-nx-surface/90 p-2 pr-3 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
              <span className="relative shrink-0">
                <Tile post="sorcerer" still className="h-10 w-10 rounded-[11px]" />
                <Face
                  who="mum"
                  size={20}
                  ring="#1a1814"
                  className="absolute -bottom-1.5 -right-1.5"
                />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-extrabold">Mum saved one</span>
                <span className="truncate text-[12px] text-nx-soft">playing next</span>
                <Credit id="sorcerer" className="text-[11px] text-nx-muted" />
              </span>
            </span>
            <span className="flex flex-col gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-nx-soft">
                Say something
              </span>
              <span className="flex h-10 items-center gap-2 rounded-full border border-white/20 bg-nx-surface/90 pl-3.5 pr-1">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  who sent this
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nx-accent text-black">
                  <Send size={14} />
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </Mock>
  )
}

/* ——— Invites ——— */

/** A made-up QR code (not a working link) with Gob in the middle. */
function QR({ className }: { className?: string }) {
  return (
    <svg viewBox="-2 -2 29 29" shapeRendering="crispEdges" className={cn('block', className)}>
      <rect x="-2" y="-2" width="29" height="29" rx="1.6" fill="#f4f1ea" />
      <path
        fill="#141414"
        fillRule="evenodd"
        d="M0 0h7v7H0z M1 1h5v5H1z M2 2h3v3H2z M18 0h7v7h-7z M19 1h5v5h-5z M20 2h3v3h-3z M0 18h7v7H0z M1 19h5v5H1z M2 20h3v3H2z M16 16h5v5h-5z M17 17h3v3h-3z M18 18h1v1h-1z"
      />
      <path
        fill="#141414"
        d="M8 0h2v1h-2z M12 0h1v1h-1z M14 0h2v1h-2z M9 1h1v1h-1z M11 1h3v1h-3z M16 1h1v1h-1z M8 2h1v1h-1z M10 2h2v1h-2z M14 2h1v1h-1z M16 2h1v1h-1z M8 3h3v1h-3z M13 3h2v1h-2z M9 4h1v1h-1z M12 4h1v1h-1z M14 4h3v1h-3z M8 5h1v1h-1z M10 5h1v1h-1z M12 5h2v1h-2z M16 5h1v1h-1z M8 6h1v1h-1z M10 6h1v1h-1z M12 6h1v1h-1z M14 6h1v1h-1z M16 6h1v1h-1z M9 7h2v1h-2z M13 7h1v1h-1z M15 7h1v1h-1z M0 8h1v1h-1z M2 8h2v1h-2z M6 8h1v1h-1z M8 8h1v1h-1z M11 8h2v1h-2z M15 8h1v1h-1z M17 8h2v1h-2z M20 8h1v1h-1z M22 8h3v1h-3z M1 9h2v1h-2z M4 9h1v1h-1z M16 9h2v1h-2z M19 9h1v1h-1z M21 9h2v1h-2z M24 9h1v1h-1z M0 10h1v1h-1z M3 10h2v1h-2z M6 10h1v1h-1z M17 10h1v1h-1z M19 10h3v1h-3z M23 10h1v1h-1z M1 11h1v1h-1z M4 11h1v1h-1z M16 11h1v1h-1z M18 11h2v1h-2z M22 11h2v1h-2z M0 12h2v1h-2z M3 12h1v1h-1z M6 12h1v1h-1z M17 12h3v1h-3z M21 12h1v1h-1z M24 12h1v1h-1z M2 13h2v1h-2z M5 13h1v1h-1z M16 13h1v1h-1z M19 13h1v1h-1z M21 13h3v1h-3z M0 14h1v1h-1z M3 14h1v1h-1z M6 14h1v1h-1z M18 14h2v1h-2z M22 14h1v1h-1z M24 14h1v1h-1z M1 15h3v1h-3z M5 15h1v1h-1z M16 15h2v1h-2z M20 15h2v1h-2z M23 15h1v1h-1z M0 16h1v1h-1z M2 16h1v1h-1z M4 16h1v1h-1z M6 16h1v1h-1z M8 16h2v1h-2z M11 16h1v1h-1z M13 16h2v1h-2z M22 16h3v1h-3z M8 17h1v1h-1z M10 17h2v1h-2z M14 17h1v1h-1z M22 17h1v1h-1z M24 17h1v1h-1z M9 18h2v1h-2z M12 18h1v1h-1z M14 18h2v1h-2z M21 18h2v1h-2z M24 18h1v1h-1z M8 19h1v1h-1z M10 19h1v1h-1z M13 19h2v1h-2z M22 19h3v1h-3z M9 20h3v1h-3z M14 20h1v1h-1z M21 20h1v1h-1z M23 20h1v1h-1z M8 21h2v1h-2z M12 21h2v1h-2z M15 21h1v1h-1z M17 21h3v1h-3z M21 21h1v1h-1z M24 21h1v1h-1z M8 22h1v1h-1z M11 22h1v1h-1z M13 22h1v1h-1z M16 22h2v1h-2z M19 22h1v1h-1z M22 22h2v1h-2z M9 23h2v1h-2z M12 23h3v1h-3z M17 23h1v1h-1z M20 23h2v1h-2z M24 23h1v1h-1z M8 24h1v1h-1z M10 24h1v1h-1z M13 24h1v1h-1z M15 24h3v1h-3z M19 24h1v1h-1z M21 24h3v1h-3z"
      />
      <rect
        x="8.7"
        y="8.7"
        width="7.6"
        height="7.6"
        rx="2"
        fill="#f4f1ea"
        shapeRendering="geometricPrecision"
      />
      <g transform="translate(9.1 9.1) scale(0.17)" shapeRendering="geometricPrecision">
        <g transform="rotate(-4 20 20)">
          <rect
            x="3"
            y="3"
            width="34"
            height="34"
            rx="14"
            fill="#ffd23f"
            stroke="#141414"
            strokeWidth="1.5"
          />
          <circle cx="14" cy="17" r="2.6" fill="#000" />
          <circle cx="26.5" cy="16" r="4" fill="#000" />
          <path
            d="M15 27.5 q5 2.6 10 -1.2"
            stroke="#000"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  )
}

export function InvitesMock() {
  return (
    <Mock label="A code to scan to pair a phone, an invite link for Ben that works once for seven days, and the people list: Ben is in with his phone paired, Mum wants in, with Approve and Not now.">
      <div className="flex items-center gap-3.5 md:gap-5">
        <span className="flex w-[38%] max-w-[240px] shrink-0 flex-col items-center gap-3">
          <span className="w-full -rotate-2 rounded-[20px] bg-[#e4dac8] p-[7%] shadow-[0_30px_70px_rgba(0,0,0,0.55)] md:rounded-[28px]">
            <QR className="h-auto w-full" />
          </span>
          <span className="hidden whitespace-nowrap text-[13px] font-semibold text-nx-soft md:block">
            Scan to pair a phone
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-2 md:gap-3.5">
          <span className={cn(card, 'hidden flex-col gap-3 rounded-[22px] p-4 md:flex')}>
            <span className="flex flex-col gap-1">
              <span className="text-[17px] font-extrabold">Invite Ben</span>
              <span className="text-[13px] text-nx-muted">
                One link signs him in and pairs his phone.
              </span>
            </span>
            <span className="flex gap-2">
              <span className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-black px-3.5 text-[13px] text-nx-soft">
                <LinkIcon size={16} className="shrink-0" />
                <span className="truncate">Works once · 7 days</span>
              </span>
              <span className="flex h-11 shrink-0 items-center whitespace-nowrap rounded-full bg-nx-accent px-4 text-[14px] font-extrabold text-black">
                Copy link
              </span>
            </span>
          </span>
          <span className="flex flex-col gap-2 md:gap-0 md:rounded-[22px] md:border md:border-white/10 md:bg-nx-surface md:px-4 md:py-1.5">
            <span
              className={cn(
                card,
                'flex h-[46px] items-center gap-2 rounded-[14px] px-2.5 md:h-[60px] md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:px-0',
              )}
            >
              <Face who="ben" size={28} className="md:!h-9 md:!w-9 md:!text-[15px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-extrabold md:text-[15px]">Ben</span>
                <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-[#5ee38a] md:text-[12px]">
                  <Check size={11} />
                  <span>In · phone paired</span>
                </span>
              </span>
              <span className="hidden whitespace-nowrap text-[12px] text-nx-muted md:inline">
                Just now
              </span>
            </span>
            <span className="hidden h-px bg-white/10 md:block" />
            <span
              className={cn(
                card,
                'flex h-[46px] items-center gap-2 rounded-[14px] pl-2.5 pr-1.5 md:h-[60px] md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:px-0',
              )}
            >
              <Face who="mum" size={28} className="md:!h-9 md:!w-9 md:!text-[15px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-extrabold md:text-[15px]">Mum</span>
                <span className="truncate text-[11px] text-nx-soft md:text-[12px]">Wants in</span>
              </span>
              <span className="flex h-8 shrink-0 items-center whitespace-nowrap rounded-full bg-nx-accent px-3 text-[12px] font-extrabold text-black md:h-9 md:px-3.5 md:text-[13px]">
                Approve
              </span>
              <span className="hidden h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-white/20 px-3 text-[13px] font-semibold md:flex">
                Not now
              </span>
            </span>
          </span>
          <span className="flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-nx-cream text-[13px] font-extrabold md:hidden">
            <LinkIcon size={15} />
            <span>Copy invite link</span>
          </span>
        </span>
      </div>
    </Mock>
  )
}

/* ——— How it works ——— */

/** Step 1: a post in another app, with ADHX in the share row. */
export function StepShare({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Tile post="palettes" still className="h-[100px] w-20 shrink-0 rounded-[16px]">
        <span className="absolute inset-0 bg-black/40" />
        <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[13px] bg-nx-ink shadow-[0_0_0_2px_rgb(var(--nx-accent))]">
          <Gob size={26} />
        </span>
      </Tile>
    )
  }
  return (
    <Tile post="palettes" still credit="tr" className="h-[250px]">
      <span className="absolute inset-x-4 bottom-4 flex flex-col gap-3 rounded-[20px] border border-white/10 bg-nx-surface/90 px-4 pb-3 pt-3.5 backdrop-blur-lg">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-nx-muted">
          Share
        </span>
        <span className="flex gap-[18px]">
          <span className="flex flex-col items-center gap-1.5">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-nx-ink shadow-[0_0_0_2px_rgb(var(--nx-accent))]">
              <Gob size={30} />
            </span>
            <span className="text-[12px] font-extrabold">ADHX</span>
          </span>
          <span className="flex flex-col items-center gap-1.5 text-nx-soft">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-[#262320]">
              <LinkIcon size={22} />
            </span>
            <span className="whitespace-nowrap text-[12px]">Copy link</span>
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <span className="h-[52px] w-[52px] rounded-[16px] bg-[#262320]" />
            <span className="mt-1 h-2 w-10 rounded bg-[#262320]" />
          </span>
          <span className="hidden flex-col items-center gap-1.5 text-nx-soft xl:flex">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-[#262320]">
              <Dots size={22} />
            </span>
            <span className="whitespace-nowrap text-[12px]">More</span>
          </span>
        </span>
      </span>
    </Tile>
  )
}

/** Step 2: the server keeping a copy, 40% done. */
export function StepKeep({ compact = false }: { compact?: boolean }) {
  return (
    <Tile
      post="modular"
      still
      credit={compact ? undefined : 'tr'}
      className={compact ? 'h-[100px] w-20 shrink-0 rounded-[16px]' : 'h-[250px]'}
    >
      <span className="absolute inset-0 bg-black/50" />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <Ring
          size={compact ? 52 : 92}
          value={0.4}
          stroke={compact ? 5 : 7}
          fill="rgba(0,0,0,0.55)"
          label="40%"
          labelSize={compact ? 13 : 22}
        />
        {!compact && (
          <span className="flex h-[34px] items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-black/55 px-3.5 text-[13px] font-extrabold backdrop-blur-md">
            <span>Keeping a copy</span>
            <span className="font-semibold text-nx-soft">· 2160p · X</span>
          </span>
        )}
      </span>
    </Tile>
  )
}

/** Step 3: the feed, with your people's faces on it. */
export function StepFeed({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Tile post="offbeat-room" still className="h-[100px] w-20 shrink-0 rounded-[16px]">
        <span className="nx-scrim absolute inset-x-0 bottom-0 h-11" />
        <Face who="ben" size={22} ring="#000" className="absolute bottom-2 left-2" />
      </Tile>
    )
  }
  return (
    <Tile post="offbeat-room" still className="h-[250px]">
      <span className="absolute left-3.5 top-3.5 flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-black/50 pl-2 pr-3.5 backdrop-blur-md">
        <Faces who={['ana', 'ben', 'mum', 'jo', 'you']} size={22} ring="#111" />
        <span className="text-[13px] font-extrabold">Your people</span>
      </span>
      <span className="nx-scrim absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-3.5 pt-14">
        <span className="flex items-center gap-2">
          <Face who="ben" size={24} ring="#000" />
          <span className="whitespace-nowrap text-[14px] font-extrabold">Ben saved this</span>
          <span className="whitespace-nowrap text-[13px] text-nx-soft">· 20m</span>
        </span>
        <Credit id="offbeat-room" className="text-[13px] text-nx-soft" />
      </span>
    </Tile>
  )
}
