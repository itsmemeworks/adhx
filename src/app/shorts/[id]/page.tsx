import { redirect } from 'next/navigation'

/**
 * ADHX no longer supports YouTube Shorts: they only play through YouTube's
 * iframe, so they can't be understood like other posts. Old /shorts links
 * go home. `shorts` stays a reserved route so no username can claim it.
 */
export default function ShortPreviewPage(): never {
  redirect('/')
}
