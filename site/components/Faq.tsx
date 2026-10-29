import { cn } from './cn'
import { ALL_PLATFORMS, networkLabel } from './networks'
import { Kicker, WRAP } from './ProductSite'

/**
 * Plain answers to what people ask before trying ADHX. The same text goes
 * into the page's FAQPage JSON-LD (components/seo.ts), so search engines and
 * answer engines quote what visitors read.
 */

const NETWORKS = ALL_PLATFORMS.map(networkLabel)
const NETWORK_LIST = `${NETWORKS.slice(0, -1).join(', ')} and ${NETWORKS.at(-1)}`

export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What is ADHX?',
    a: 'A private social network you run for one group of friends and family. Everyone saves the best posts they find on the big networks, and ADHX keeps a copy of each and plays them in one feed, with the face of whoever saved it. You decide who joins.',
  },
  {
    q: 'Can my mum use it?',
    a: 'Yes. One of you runs it; everyone else taps an invite link and picks a name. No password to remember, and it works in any browser. For saving from her iPhone’s share button, whoever runs your ADHX can offer the app through TestFlight, or she can add a three-step Shortcut from Settings. Android installs the app from GitHub.',
  },
  {
    q: 'Is ADHX free?',
    a: 'Yes. It’s open source under the MIT licence, with no subscription and no ads. You pay for wherever you run it, which can be a computer you already own.',
  },
  {
    q: 'Can I try it before installing anything?',
    a: 'Yes. demo.adhx.com is a live ADHX where you’re Sam and your friends have been busy. No sign-up, and nothing you do there is saved.',
  },
  {
    q: 'What does it need to run?',
    a: 'Anything with Docker, amd64 or arm64: a NAS, a mini PC, a spare laptop or a small cloud server. 4 GB of memory is comfortable (2 GB works with speech and screen text switched off), and no GPU. Roughly 10–30 GB of disk per 1,000 saves. The first start downloads about 800 MB of search models in the background.',
  },
  {
    q: 'Which networks can I save from?',
    a: `${NETWORK_LIST}. Share a post to ADHX from the app, or paste its link.`,
  },
  {
    q: 'What does the AI do, and does it send my data anywhere?',
    a: 'Three open models run on your own server, free: EmbeddingGemma 2 understands pictures, video and words, Whisper listens to speech and Florence-2 reads text on screen. That powers search by description, the For you part of Home, self-sorting channels and Live moments. The models are downloaded once from Hugging Face, and no frame or sound leaves machines you run. The optional Jev key sends your search and the words of the public posts being ranked to TypeSafe (thumbnails too, if you switch on channel pictures), never who saved what.',
  },
  {
    q: 'Who can join?',
    a: 'People you send an invite link to. Each link works once and runs out after a week, and you can make anyone your friends invite wait for your approval. Once you set up email, anyone who reaches your sign-in page can ask for a link too, unless you list who may sign up in Admin → System → Settings.',
  },
  {
    q: 'Who can see what we save?',
    a: 'Your feed, your faces and who saved what are only for people on your server. Some pages are public, though, and search engines can find them: a shared post’s preview page (which never says who saved it) and Right now, which shows what’s being saved with counts but no names. The kept file of a shared post plays for anyone with its address. Want nothing reachable from outside? Keep ADHX on your home network or Tailscale. Just for me keeps a save to yourself.',
  },
  {
    q: 'Is it OK to download other people’s posts?',
    a: 'ADHX is for keeping posts for yourself and your group, not republishing them. It keeps the creator’s name on every post, and copyright stays with them. Each network has its own terms about downloading, so check the ones that matter to you. Admins can hide any post in one click, and every hide is logged.',
  },
  {
    q: 'What happens when the original post is deleted?',
    a: 'Nothing, for your group. ADHX keeps a real copy in the best quality the network offers when it’s saved, and plays it from your server. It can’t keep posts that are private or DRM-protected.',
  },
  {
    q: 'What happens when a network changes something?',
    a: 'Downloads go through yt-dlp, and X through FxTwitter. When a network changes, saving from it can break until those tools catch up. Copies you already kept are safe on your server.',
  },
  {
    q: 'How do I update it and back it up?',
    a: 'Pull the new image and restart, or run the installer again; the database updates itself on start. Everything ADHX keeps is in one /data folder: stop ADHX and copy it.',
  },
]

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 border-t border-white/10">
      <div
        className={cn(
          WRAP,
          'grid gap-5 pb-12 pt-9 md:gap-10 md:py-16 lg:grid-cols-[minmax(0,380fr)_minmax(0,756fr)] lg:gap-16',
        )}
      >
        <div className="flex flex-col gap-2.5 md:gap-4">
          <Kicker>FAQ</Kicker>
          <h2
            id="faq-title"
            className="m-0 font-nx-serif text-[36px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[56px]"
          >
            Fair questions.
          </h2>
          <p className="m-0 text-[15px] leading-[1.45] text-nx-soft md:text-[18px] md:leading-[1.55]">
            The short answers. The long ones are on GitHub.
          </p>
        </div>
        <div className="flex flex-col border-b border-white/10">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="nx-faq group border-t border-white/10">
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16px] font-extrabold md:text-[18px]">
                <h3 className="m-0 text-[inherit] font-[inherit]">{q}</h3>
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-[18px] leading-none text-nx-accent transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="m-0 pb-4 pr-10 text-[15px] leading-[1.55] text-nx-soft md:text-[16px]">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
