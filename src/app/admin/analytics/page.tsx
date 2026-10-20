import { analyticsBoard } from '@/lib/admin/boards/analytics'
import { parseAdminRange, rangeWords } from '@/lib/admin/shared'
import { adminPageActor, rangeParam, type AdminSearchParams } from '@/lib/admin/page-gate'
import { AnalyticsView } from '@/components/next/admin/AnalyticsView'

export const dynamic = 'force-dynamic'

/** /admin/analytics (board 10.6). */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams?: AdminSearchParams
}) {
  await adminPageActor()
  const range = parseAdminRange(await rangeParam(searchParams), 'month')
  return <AnalyticsView data={analyticsBoard(range)} rangeWords={rangeWords(range)} />
}
