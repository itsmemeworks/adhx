import { NowScreen } from '@/components/next/moments/NowScreen'

/**
 * `/now` — Right now: what people are saving, grouped into moments live,
 * each one ready to Tune in to. The signed-in home. Open to everyone, like
 * the moments themselves (savers are counted, never named).
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Right now · adhx', robots: { index: false } }

export default function NowPage() {
  return <NowScreen />
}
