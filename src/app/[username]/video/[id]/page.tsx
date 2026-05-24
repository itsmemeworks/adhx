import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { TikTokPreviewLanding } from '@/components/TikTokPreviewLanding'
import {
  fetchTikTokMetadata,
  isValidUsername,
  isValidVideoId,
} from '@/lib/media/tnktok'

interface Props {
  params: Promise<{ username: string; id: string }>
}

function normalizeHandle(raw: string): string {
  // Next.js passes the dynamic segment URL-encoded, so `@user` arrives as `%40user`.
  const decoded = decodeURIComponent(raw)
  return decoded.startsWith('@') ? decoded.slice(1) : decoded
}

export default async function TikTokPreviewPage({ params }: Props) {
  const { username, id } = await params
  const handle = normalizeHandle(username)

  if (!isValidUsername(handle) || !isValidVideoId(id)) {
    redirect('/')
  }

  const meta = await fetchTikTokMetadata(handle, id)

  return (
    <TikTokPreviewLanding
      username={handle}
      videoId={id}
      authorName={meta?.authorName}
      author={meta?.author}
      description={meta?.description}
      hasVideo={!!meta?.videoUrl}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, id } = await params
  const handle = normalizeHandle(username)

  if (!isValidUsername(handle) || !isValidVideoId(id)) {
    return { title: 'ADHX — Save now. Read never. Find always.' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const canonicalUrl = `${baseUrl}/@${handle}/video/${id}`
  const meta = await fetchTikTokMetadata(handle, id)

  const title = meta?.title || `TikTok @${handle} — Download on ADHX`
  const description = meta?.description || `Download this TikTok by @${handle} as MP4.`

  return {
    title,
    description,
    openGraph: {
      type: 'video.other',
      title,
      description,
      siteName: 'ADHX',
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: canonicalUrl,
    },
  }
}
