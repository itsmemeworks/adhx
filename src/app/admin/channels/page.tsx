import { channelsBoard } from '@/lib/admin/boards/live'
import { parseAdminRange, rangeWords } from '@/lib/admin/shared'
import { adminPageActor, rangeParam, type AdminSearchParams } from '@/lib/admin/page-gate'
import { ChannelsView } from '@/components/next/admin/ChannelsView'

export const dynamic = 'force-dynamic'

/** /admin/channels: Channels and Live (board 10.4). */
export default async function AdminChannelsPage({
  searchParams,
}: {
  searchParams?: AdminSearchParams
}) {
  await adminPageActor()
  const range = parseAdminRange(await rangeParam(searchParams), 'week')
  return <ChannelsView data={await channelsBoard(range)} rangeWords={rangeWords(range)} />
}
