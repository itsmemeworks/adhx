import { NowScreen } from '@/components/next/moments/NowScreen'

/**
 * `/now` — Right now: what people are saving, grouped into moments live,
 * each one ready to Tune in to. The signed-in home. Open to everyone, like
 * the moments themselves (savers are counted, never named).
 */
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Right now · adhx',
  description:
    'What people are saving on ADHX, grouped into moments as it happens. Tune in and new saves play as they land.',
  openGraph: {
    title: 'Right now on ADHX',
    description: 'What people are saving, grouped into moments as it happens.',
  },
}

export default function NowPage() {
  return <NowScreen />
}
