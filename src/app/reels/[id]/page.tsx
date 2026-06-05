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
  // Page <title> for the browser tab; unfurl headline says "Preview" (the
  // "ADHX" label comes from og:site_name, so don't repeat it in the title).
  const pageTitle = who ? `${who} on Instagram` : 'Instagram Reel'
  const headline = who ? `Preview ${who}'s reel` : 'Preview this Instagram reel'
  const description = meta?.caption || meta?.description || 'Preview this Instagram Reel on ADHX.'
  const image = meta?.imageUrl
    ? `${baseUrl}/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
    : `${baseUrl}/og-logo.png`

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
