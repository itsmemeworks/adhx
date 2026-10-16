import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { isNextUiEnabled } from '@/lib/next-ui/server'
import { TheaterV2 } from '@/components/next/theater/TheaterV2'
import { sourceFromParams } from '@/components/next/theater/queue'

/**
 * `/play` — the redesigned theater (phase 4, behind `next_ui`), playing a
 * search's results as its queue: `/play?q=&scope=&type=&words=1&group=&start=`,
 * a channel (`?channel=user/tag`, public ones for anyone) or one of your
 * "Made for you" channels (`?auto=slug`).
 * With the flag off it falls back to Saved.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Playing · adhx', robots: { index: false } }

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  if (!(await isNextUiEnabled(params))) redirect('/saved')
  const source = sourceFromParams(params)
  // Anyone can watch a public channel; everything else is your own.
  if (!source.channel && !(await getCurrentUserId())) redirect('/start?returnTo=%2Fsearch')
  if (!source.channel && !source.auto && !source.recent && !source.search.q.trim())
    redirect('/search')
  return <TheaterV2 source={source} />
}
