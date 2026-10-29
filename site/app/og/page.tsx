import type { Metadata } from 'next'
import { OgCard } from '../../components/OgCard'

export const metadata: Metadata = {
  title: 'Share card',
  robots: { index: false },
}

/** The 1200 × 630 share card; `pnpm site:og` screenshots it to public/og.png. */
export default function OgPage() {
  return <OgCard />
}
