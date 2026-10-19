import type { Metadata } from 'next'
import { NextUiPreview } from './NextUiPreview'

export const metadata: Metadata = {
  title: 'next_ui preview',
  robots: { index: false, follow: false },
}

/** Dev-only (gated by `src/app/dev/layout.tsx`): every next_ui primitive with real saved posts. */
export default function NextUiPreviewPage() {
  return <NextUiPreview />
}
