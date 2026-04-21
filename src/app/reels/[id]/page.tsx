import { redirect } from 'next/navigation'
import { Metadata } from 'next'
import { InstagramPreviewLanding } from '@/components/InstagramPreviewLanding'
import { fetchReelMetadata, isValidReelId } from '@/lib/media/instafix'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ReelPreviewPage({ params }: Props) {
  const { id } = await params

  if (!isValidReelId(id)) {
    redirect('/')
  }

  const meta = await fetchReelMetadata(id)

  return (
    <InstagramPreviewLanding
      reelId={id}
      title={meta?.title}
      description={meta?.description}
      imageUrl={meta?.imageUrl}
      author={meta?.author}
      hasVideo={!!meta?.videoUrl}
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

  const title = meta?.title || `Instagram Reel — Download on ADHX`
  const description = meta?.description || 'Download this Instagram Reel as MP4.'
  const image = meta?.imageUrl || `${baseUrl}/og-logo.png`

  return {
    title,
    description,
    openGraph: {
      type: 'video.other',
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
