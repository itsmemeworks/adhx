import type { ReactNode } from 'react'
import { cn } from './cn'
import { Face } from './People'
import { Credit, PostMedia } from './Post'
import { Arrow, Heart, List, Screen, Search, Sparkle, Together, Wave } from './icons'
import { Kicker, WRAP } from './ProductSite'

/**
 * The AI, plainly: what runs on the server for free (EmbeddingGemma 2,
 * Whisper, Florence-2), what the optional Jev key adds, and what either one
 * changes for the people watching. Keep it true to src/lib/semantic and
 * src/lib/semantic/jev.ts: the models run on the server or its Mac helper,
 * and Jev only ever gets the search and public post words.
 */

const MODELS: Array<{ name: string; by: string; does: string }> = [
  {
    name: 'EmbeddingGemma 2',
    by: 'Google’s open model',
    does: 'Understands pictures, video and words alike, so “cat playing piano” finds the cat playing the piano.',
  },
  {
    name: 'Whisper',
    by: 'open speech model',
    does: 'Listens to what’s said in videos, in dozens of languages.',
  },
  {
    name: 'Florence-2',
    by: 'open vision model',
    does: 'Reads the words on screen: subtitles, signs, the caption baked into the meme.',
  },
]

const PAYOFFS: Array<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <Search size={20} />,
    title: 'Find it by describing it',
    body: 'The punchline, the song, the thing in the background. Not the caption nobody remembers.',
  },
  {
    icon: <Heart size={20} />,
    title: 'A Home that gets your taste',
    body: 'After what’s new, more like what you keep. Learned on your server, not sold to anyone.',
  },
  {
    icon: <List size={20} />,
    title: 'Channels that sort themselves',
    body: 'Everyone’s saves grouped by what they’re about, then named. Rabbit holes, pre-dug.',
  },
  {
    icon: <Together size={20} />,
    title: 'Live moments',
    body: 'What your lot are saving tonight, gathered into moments as each save lands.',
  },
]

function Reading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-white/15 bg-black/70 py-1.5 pl-2 pr-3 text-[12px] font-semibold text-nx-cream backdrop-blur-md md:text-[13px]">
      <span className="shrink-0 text-nx-accent">{icon}</span>
      <span className="min-w-0">{children}</span>
    </span>
  )
}

/** A save being understood, then found by what someone remembered. */
function Understanding() {
  return (
    <figure className="m-0 flex flex-col gap-3">
      <div aria-hidden className="relative overflow-hidden rounded-[22px] border border-white/10">
        <div className="relative aspect-[16/10]">
          <PostMedia id="offbeat" className="absolute inset-0 h-full w-full" />
          <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.75),rgba(0,0,0,0.1)_70%)]" />
          <Credit id="offbeat" chip className="absolute bottom-3 right-3" />
          <span className="absolute left-3 top-3 flex max-w-[78%] flex-col items-start gap-1.5 md:left-4 md:top-4 md:gap-2">
            <Reading icon={<Sparkle size={15} />}>Sees a pixel-art cat, piano for a belly</Reading>
            <Reading icon={<Wave size={15} />}>Hears what’s said</Reading>
            <Reading icon={<Screen size={15} />}>Reads the words on screen</Reading>
          </span>
        </div>
      </div>
      <div
        aria-hidden
        className="flex items-center gap-2.5 rounded-[18px] border border-white/10 bg-nx-surface px-3 py-2.5"
      >
        <Face who="mum" size={26} />
        <Search size={16} className="shrink-0 text-nx-muted" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold md:text-[15px]">
          that cat that’s also a piano
        </span>
        <span className="shrink-0 rounded-full bg-nx-accent/[0.14] px-2.5 py-1 text-[11px] font-extrabold text-nx-accent">
          Strong match
        </span>
      </div>
      <figcaption className="sr-only">
        ADHX understanding a saved video of a pixel-art cat whose belly is a toy piano: it sees
        what’s in the picture, hears what’s said and reads the words on screen. Mum searches “that
        cat that’s also a piano” and it comes up as a strong match.
      </figcaption>
    </figure>
  )
}

export function AiSection() {
  return (
    <section id="ai" aria-labelledby="ai-title" className="scroll-mt-16 border-t border-white/10">
      <div className={cn(WRAP, 'flex flex-col gap-6 pb-12 pt-9 md:gap-10 md:py-16')}>
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,516fr)_minmax(0,620fr)] lg:gap-16">
          <div className="flex flex-col gap-2.5 md:gap-4">
            <Kicker>
              <Sparkle size={15} />
              <span>Built-in AI</span>
            </Kicker>
            <h2
              id="ai-title"
              className="m-0 font-nx-serif text-[36px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[56px]"
            >
              <span className="block">It understands every save.</span>
              <span className="block text-nx-accent">You just remember the gist.</span>
            </h2>
            <p className="m-0 text-[15px] leading-[1.45] text-nx-soft md:text-[18px] md:leading-[1.55]">
              ADHX doesn’t just store posts. It looks at the pictures, watches the videos, listens
              to what’s said and reads what’s on screen. That’s how search finds things by
              description, and how Home, channels and Live know what goes with what. It runs on your
              server, free. No API bill, no account, nobody else’s cloud.
            </p>
          </div>
          <Understanding />
        </div>

        <div className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-nx-surface p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-nx-accent px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-black">
                Built in · free
              </span>
              <h3 className="m-0 text-[19px] font-extrabold leading-tight md:text-[22px]">
                Three open models, on your box
              </h3>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {MODELS.map((m) => (
                <li
                  key={m.name}
                  className="flex flex-col gap-1 border-t border-white/10 py-3 first:border-t-0 first:pt-0 md:flex-row md:gap-5"
                >
                  <span className="flex shrink-0 flex-col md:w-[170px]">
                    <span className="text-[15px] font-extrabold md:text-[16px]">{m.name}</span>
                    <span className="text-[12px] text-nx-muted md:text-[13px]">{m.by}</span>
                  </span>
                  <span className="text-[14px] leading-[1.45] text-nx-soft md:text-[15px]">
                    {m.does}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-0 border-t border-white/10 pt-3 text-[13px] leading-[1.5] text-nx-muted md:text-[14px]">
              No frame or sound leaves your server. Got a spare Mac? It can take the heavy lifting.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-[24px] border border-dashed border-white/20 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-nx-accent/60 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-nx-accent">
                Optional
              </span>
              <h3 className="m-0 text-[19px] font-extrabold leading-tight md:text-[22px]">
                Jev, for the finishing touches
              </h3>
            </div>
            <p className="m-0 text-[14px] leading-[1.5] text-nx-soft md:text-[15px]">
              Add a key for Jev, TypeSafe’s decision model, and it reads your search against the top
              results and puts the one you meant first, the way a person would. It also gives
              channels and Live moments proper names instead of “cluster 7”.
            </p>
            <p aria-hidden className="m-0 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded-full border border-white/15 px-3 py-1 text-nx-muted line-through">
                cluster 7
              </span>
              <Arrow size={16} className="text-nx-accent" />
              <span className="rounded-full bg-nx-accent/[0.14] px-3 py-1 font-extrabold text-nx-accent">
                Synths you can play
              </span>
            </p>
            <p className="m-0 mt-auto text-[13px] leading-[1.5] text-nx-muted md:text-[14px]">
              Jev only sees your search and public post words, never who saved what. Leave it off
              and everything still works.
            </p>
          </div>
        </div>

        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {PAYOFFS.map((p) => (
            <li
              key={p.title}
              className="flex flex-col gap-2 rounded-[20px] border border-white/10 bg-black/40 p-4 md:p-5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-nx-accent/[0.14] text-nx-accent">
                {p.icon}
              </span>
              <h3 className="m-0 text-[16px] font-extrabold leading-tight md:text-[17px]">
                {p.title}
              </h3>
              <p className="m-0 text-[14px] leading-[1.45] text-nx-soft">{p.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
