import { Gob } from './Gob'
import { NetworkIcon } from './NetworkIcon'
import { ALL_PLATFORMS } from './networks'
import { Face, type PersonId } from './People'
import { Credit, PostMedia } from './Post'

/**
 * The share card (Open Graph and X), 1200 × 630, drawn with the site's own
 * parts. Screenshotted to public/og.png by scripts/og.mjs.
 */

const FACES: PersonId[] = ['ana', 'ben', 'mum', 'jo']

export function OgCard() {
  return (
    <main
      id="og"
      className="relative flex h-[630px] w-[1200px] overflow-hidden bg-black font-nx-sans text-nx-cream"
    >
      <div className="absolute inset-y-0 right-0 w-[520px]">
        <PostMedia id="offbeat" still className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.55)_30%,rgba(0,0,0,0)_60%)]" />
        <Credit id="offbeat" chip className="absolute right-10 top-10" />
        <div className="absolute bottom-10 right-10 flex items-center gap-3 rounded-full bg-black/70 py-2 pl-2 pr-5 backdrop-blur-md">
          <span className="flex">
            {FACES.map((who, i) => (
              <Face key={who} who={who} size={40} ring="#000" className={i ? '-ml-1.5' : ''} />
            ))}
          </span>
          <span className="text-[20px] font-extrabold">saved this for you</span>
        </div>
      </div>
      <div className="relative flex w-[760px] flex-col justify-between py-14 pl-16">
        <div className="flex items-center gap-3">
          <Gob size={52} />
          <span className="font-nx-serif text-[48px] leading-none">adhx</span>
        </div>
        <div className="flex flex-col gap-5">
          <h1 className="m-0 font-nx-serif text-[76px] font-normal leading-[0.95] tracking-[-0.015em]">
            <span className="block">Your friends have</span>
            <span className="block">better taste than</span>
            <span className="block text-nx-accent">the algorithm.</span>
          </h1>
          <p className="m-0 text-[24px] font-semibold leading-snug text-nx-soft">
            The private social network for you and your friends.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex gap-1.5">
            {ALL_PLATFORMS.map((p) => (
              <span
                key={p}
                className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#262320]"
              >
                <NetworkIcon platform={p} className="h-4 w-4 text-white" />
              </span>
            ))}
          </span>
        </div>
        <p className="m-0 text-[18px] font-bold text-nx-muted">
          Self-hosted · Open source · Free AI search · adhx.com
        </p>
      </div>
    </main>
  )
}
