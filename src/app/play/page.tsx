import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { startHref } from '@/lib/next-ui/routes'
import { TheaterV2 } from '@/components/next/theater/TheaterV2'
import { sourceFromParams } from '@/components/next/theater/queue'

/**
 * `/play` — the redesigned theater, playing a
 * search's results as its queue: `/play?q=&scope=&type=&words=1&group=&start=`,
 * a channel (`?channel=user/tag`, public ones for anyone), one of your
 * "Made for you" channels (`?auto=slug`), a From everyone channel
 * (`?group=slug`), a friend's channel (`?friend=username`, `&new=1` for the
 * new ones) a live moment (`?moment=slug`, Tune in; anyone) or the blended feed
 * (`?feed=new|everyone|friends|mine`; New is the signed-in home).
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Playing · adhx', robots: { index: false } }

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const source = sourceFromParams(params)
  // Anyone can watch a public channel or tune in to a moment; everything else is your own.
  const open = !!source.channel || !!source.moment
  if (!open && !(await getCurrentUserId())) redirect(startHref('/play', params))
  if (
    !open &&
    !source.feed &&
    !source.auto &&
    !source.groupChannel &&
    !source.friend &&
    !source.recent &&
    !source.search.q.trim()
  )
    redirect('/search')
  return <TheaterV2 source={source} />
}
