import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { YouTubePreviewLanding } from '@/components/YouTubePreviewLanding'
import { fetchYouTubeMetadata, isValidVideoId, youtubeThumbnail } from '@/lib/media/youtube'
import { getSession } from '@/lib/auth/session'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { isLikelyBot } from '@/lib/activity/bot'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ShortPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidVideoId(id)) {
    redirect('/')
  }

  const [meta, session] = await Promise.all([
    fetchYouTubeMetadata(id),
    getSession(),
  ])

  if (meta && !isLikelyBot((await headers()).get('user-agent'))) {
    const author = meta.author?.replace(/^@/, '') || meta.authorName || 'youtube'
    recordActivity({
      action: 'preview',
      platform: 'youtube',
      bookmarkId: id,
      author,
      authorName: meta.authorName || null,
      text: meta.title || null,
      thumbnailUrl: meta.thumbnailUrl,
      url: previewPath('youtube', author, id),
    })
  }

  return (
    <YouTubePreviewLanding
      videoId={id}
      title={meta?.title}
      authorName={meta?.authorName}
      author={meta?.author}
      hasVideo={!!meta}
      isAuthenticated={!!session}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  if (!isValidVideoId(id)) {
    return { title: 'ADHX — Save now. Read never. Find always.' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const canonicalUrl = `${baseUrl}/shorts/${id}`
  const meta = await fetchYouTubeMetadata(id)

  const who = meta?.authorName || meta?.author
  const pageTitle = meta?.title || (who ? `${who} on YouTube` : 'YouTube Short')
  const headline = meta?.title
    ? meta.title
    : who
      ? `Preview ${who}'s Short`
      : 'Preview this YouTube Short'
  const description =
    (who ? `${who} on YouTube. ` : '') + 'Preview and save this YouTube Short to ADHX.'
  const image = meta ? youtubeThumbnail(id) : `${baseUrl}/og-logo.png`

  return {
    title: pageTitle,
    description,
    openGraph: {
      type: 'video.other',
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
