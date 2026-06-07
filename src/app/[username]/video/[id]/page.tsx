import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { TikTokPreviewLanding } from '@/components/TikTokPreviewLanding'
import { fetchTikTokMetadata, isValidUsername, isValidVideoId } from '@/lib/media/tnktok'
import { getSession } from '@/lib/auth/session'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { isLikelyBot } from '@/lib/activity/bot'

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

  const [meta, session] = await Promise.all([fetchTikTokMetadata(handle, id), getSession()])

  if (meta && !isLikelyBot((await headers()).get('user-agent'))) {
    recordActivity({
      action: 'preview',
      platform: 'tiktok',
      bookmarkId: id,
      author: meta.author || handle,
      authorName: meta.authorName || null,
      text: meta.description || meta.title || null,
      thumbnailUrl: null, // tnktok exposes no poster; card falls back to the glyph
      url: previewPath('tiktok', meta.author || handle, id),
    })
  }

  return (
    <TikTokPreviewLanding
      username={handle}
      videoId={id}
      authorName={meta?.authorName}
      author={meta?.author}
      description={meta?.description}
      hasVideo={!!meta?.videoUrl}
      isAuthenticated={!!session}
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

  const who = meta?.authorName || meta?.author || `@${handle}`
  // Page <title> for the tab; unfurl headline says "Preview" (og:site_name
  // already carries "ADHX", so don't repeat it in the title).
  const pageTitle = meta?.title || `@${handle} on TikTok`
  const headline = `Preview ${who}'s TikTok`
  const description = meta?.description || `Watch this TikTok by @${handle} on ADHX.`
  // Poster via the thumbnail proxy so the card unfurls with an image.
  const image = `${baseUrl}/api/media/tiktok/thumbnail?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(id)}`

  return {
    title: pageTitle,
    description,
    openGraph: {
      type: 'article',
      title: headline,
      description,
      siteName: 'ADHX',
      url: canonicalUrl,
      images: [{ url: image, alt: headline }],
    },
    twitter: {
      card: 'summary_large_image',
      title: headline,
      description,
      images: [image],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  }
}
