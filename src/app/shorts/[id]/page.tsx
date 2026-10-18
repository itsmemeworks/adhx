import { redirect } from 'next/navigation'

/** Old `/shorts/{id}` links (and pasted Shorts paths) open the YouTube post. */
export default async function ShortPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<never> {
  const { id } = await params
  redirect(/^[\w-]{11}$/.test(id) ? `/s/youtube/${id}` : '/')
}
