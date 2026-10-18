import type { Metadata } from 'next'
import { HeroReel } from '@/components/site/HeroReel'

export const metadata: Metadata = {
  title: 'ADHX in thirty seconds',
  robots: { index: false },
}

/** The feature reel on its own, full width (the MP4 is recorded from this). */
export default function ShowreelPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-black p-0">
      <HeroReel className="w-full" controls={false} bare />
    </main>
  )
}
