import { notFound } from 'next/navigation'
import { MomentScreen } from '@/components/next/moments/MomentScreen'

/** `/moments/{slug}` — one "Right now" moment, live. Anyone can watch. */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Right now · adhx', robots: { index: false } }

const SLUG = /^[a-z0-9-]{1,64}$/

export default async function MomentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!SLUG.test(slug)) notFound()
  return <MomentScreen slug={slug} />
}
