import { cn } from './cn'
import { PhoneFrame } from './frames'

/**
 * Screenshots of the real apps. They are taken from the showcase test world
 * (`PARITY_SHOWCASE=1 pnpm parity:serve`, see e2e/parity/showcase.ts): the
 * fictional people Pete, Ana, Ben, Mum and Jo, saving the posts credited on
 * this site. Files live in public/shots.
 */

export function PhoneShot({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    <PhoneFrame className={className}>
      <img
        src={`/shots/${src}.webp`}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
    </PhoneFrame>
  )
}

/** ADHX on the web, in a laptop-like frame (screens are 1440 × 900). */
export function WebShot({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-white/10 bg-nx-surface p-[1.6%] shadow-[0_40px_90px_rgba(0,0,0,0.6)] md:rounded-[22px]',
        className,
      )}
    >
      <img
        src={`/shots/${src}.webp`}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block aspect-[1440/900] w-full rounded-[8px] bg-black object-cover md:rounded-[12px]"
      />
    </div>
  )
}

/** One or two phones, side by side, the second a little lower. */
export function PhonePair({ shots }: { shots: Array<{ src: string; alt: string }> }) {
  return (
    <div className="flex items-center justify-center gap-3.5 py-2 md:gap-10 md:py-6">
      {shots.map((shot, i) => (
        <PhoneShot
          key={shot.src}
          src={shot.src}
          alt={shot.alt}
          className={cn(
            'w-[46%] max-w-[260px]',
            shots.length > 1 && (i === 0 ? 'md:-translate-y-3.5' : 'md:translate-y-3.5'),
          )}
        />
      ))}
    </div>
  )
}
