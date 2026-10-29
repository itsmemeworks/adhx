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
    a: 'A private social network for one group of friends and family. Everyone saves the best posts they find on the big networks, and ADHX keeps a copy of each and plays them in one feed, with the face of whoever saved it. It runs on a server you control, so the only people on it are the ones you invite.',
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
    q: 'What do I need to host it?',
    a: 'Anything that runs Docker: a NAS, a mini PC, a spare laptop or a small cloud server. It’s one container and one folder of data. There are one-click installs for Render, Fly, Railway, Unraid, Umbrel, Portainer, Coolify, Synology and TrueNAS.',
  },
  {
    q: 'Which networks can I save from?',
    a: `${NETWORK_LIST}. Share a post to ADHX from the app, or paste its link.`,
  },
  {
    q: 'What does the AI do, and does it send my data anywhere?',
    a: 'Three open models run on your own server, free: EmbeddingGemma 2 understands pictures, video and words, Whisper listens to speech and Florence-2 reads text on screen. That powers search by description, the For you part of Home, self-sorting channels and Live moments. No frame or sound leaves your server. The optional Jev key sends only your search and public post words to TypeSafe, never who saved what.',
  },
  {
    q: 'Do my friends need to install anything?',
    a: 'No. An invite link signs them in on the web. To save from their phone’s share button there are free iPhone and Android apps, and the same link pairs them.',
  },
  {
    q: 'What happens when the original post is deleted?',
    a: 'Nothing, for you. ADHX keeps a real copy in the best quality the network offers when it’s saved, and plays it from your server. Posts that are private or DRM-protected when saved may not download.',
  },
  {
    q: 'Who can see what I save?',
    a: 'The people on your server. Saves go to them by default; switch on Just for me to keep one to yourself. A post’s page can be shared by link, but it never says who saved it.',
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
