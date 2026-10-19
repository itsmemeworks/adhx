import { redirect } from 'next/navigation'
import { TAGS_TO_CHANNELS } from '@/lib/next-ui/routes'

/** `/tags` (old links) → channels. */
export default function TagsPage() {
  redirect(TAGS_TO_CHANNELS)
}
