import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { InstagramPreviewLanding } from '@/components/InstagramPreviewLanding'
import { fetchReelMetadata, isValidReelId } from '@/lib/media/instafix'
import { getSession } from '@/lib/auth/session'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReelPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidReelId(id)) {
    redirect('/')
  }

  const [meta, session] = await Promise.all([
    fetchReelMetadata(id),
    getSession(),
  ])

  return (
    <InstagramPreviewLanding
      reelId={id}
      caption={meta?.caption}
      description={meta?.description}
      // Served via the proxy (re-resolves the signed CDN URL fresh).
      imageUrl={meta?.imageUrl ? `/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}` : undefined}
      author={meta?.author}
      authorName={meta?.authorName}
      isAuthenticated={!!session}
    />
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  if (!isValidReelId(id)) {
    return {
      title: 'ADHX — Save now. Read never. Find always.',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const canonicalUrl = `${baseUrl}/reels/${id}`
  const meta = await fetchReelMetadata(id)

  const who = meta?.authorName || meta?.author
  const title = who ? `${who} on Instagram — Save to ADHX` : 'Instagram Reel — Save to ADHX'
  const description = meta?.caption || meta?.description || 'Save this Instagram Reel to your ADHX collection.'
  const image = meta?.imageUrl
    ? `${baseUrl}/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
    : `${baseUrl}/og-logo.png`

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title,
      description,
      siteName: 'ADHX',
      url: canonicalUrl,
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  }
}
