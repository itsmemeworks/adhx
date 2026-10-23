import Link from 'next/link'
import { NxLogo } from '@/components/next/PrimaryNav'

/**
 * 404, in the new look. It can show at any address, so it covers the whole
 * screen (the old site header would otherwise sit above it).
 */
export default function NotFound() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black font-nx-sans text-nx-ink">
      <header className="px-4 py-3 md:px-7 md:py-[18px]">
        <NxLogo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-24 text-center">
        <h1 className="m-0 font-nx-serif text-[40px] font-normal leading-none md:text-[52px]">
          Nothing here
        </h1>
        <p className="m-0 max-w-[420px] text-[15px] text-nx-ink/70">
          This page doesn’t exist, or it wandered off.
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Link
            href="/now"
            className="flex h-12 items-center rounded-full bg-nx-accent px-6 text-[15px] font-extrabold text-black"
          >
            Right now
          </Link>
          <Link
            href="/search"
            className="flex h-12 items-center rounded-full border border-white/30 px-6 text-[15px] font-bold"
          >
            Search
          </Link>
        </div>
      </main>
    </div>
  )
}
