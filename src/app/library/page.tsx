import { redirect } from 'next/navigation'
import { libraryToSearch } from '@/lib/next-ui/routes'

/** `/library?search=` (old library links) → search. */
export const dynamic = 'force-dynamic'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  redirect(libraryToSearch((await searchParams).search))
}
