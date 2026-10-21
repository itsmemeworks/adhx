import { liveBoard } from '@/lib/admin/boards/live'
import { parseAdminRange, rangeWords } from '@/lib/admin/shared'
import { adminPageActor, rangeParam, type AdminSearchParams } from '@/lib/admin/page-gate'
import { LiveView } from '@/components/next/admin/LiveView'

export const dynamic = 'force-dynamic'

/** /admin/live (board 10.5). */
export default async function AdminLivePage({
  searchParams,
}: {
  searchParams?: AdminSearchParams
}) {
  const actor = await adminPageActor()
  const range = parseAdminRange(await rangeParam(searchParams), 'week')
  return <LiveView data={await liveBoard(range, actor.userId)} rangeWords={rangeWords(range)} />
}
