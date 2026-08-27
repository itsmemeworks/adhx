import type { Metadata } from 'next'
import { InstagramPreviewPage, generateInstagramPreviewMetadata } from '@/app/reels/[id]/page'

interface Props {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export default function InstagramPostPreviewPage({ params }: Props) {
  return InstagramPreviewPage({ params, pathHint: 'post' })
}

export function generateMetadata(props: Props): Promise<Metadata> {
  return generateInstagramPreviewMetadata(props, 'post')
}
