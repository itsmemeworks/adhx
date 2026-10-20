import { overviewBoard } from '@/lib/admin/boards/overview'
import { serverInfo } from '@/lib/admin/boards/overview'
import { parseAdminRange } from '@/lib/admin/shared'
import { adminPageActor, rangeParam, type AdminSearchParams } from '@/lib/admin/page-gate'
import { OverviewView } from '@/components/next/admin/OverviewView'

export const dynamic = 'force-dynamic'

/** /admin: the Overview (board 10.1). */
export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams?: AdminSearchParams
}) {
  await adminPageActor()
  const range = parseAdminRange(await rangeParam(searchParams), 'week')
  return <OverviewView data={await overviewBoard(range)} server={serverInfo().name} />
}
