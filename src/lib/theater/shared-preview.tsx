import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SharedPostStatic, type SharedPostStaticProps } from '@/components/theater/SharedPostStatic'
import { PreviewTheater } from '@/components/next/theater/PreviewTheater'
import { RelatedSaves } from '@/components/RelatedSaves'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'
import { buildSharedSeed } from './shared-seed'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import type { SharedResolveResult } from './shared-resolve'

export { recordHumanPreview } from './record-human-preview'

export const MODERATED_PAGE_METADATA: Metadata = {
  title: 'Post removed',
  description: 'This post was removed from ADHX.',
  robots: { index: false },
}

export async function sharedPreviewSeed(sharedItem: TheaterItem): Promise<TheaterFeedSeed> {
  const { seed } = await buildSharedSeed(sharedItem)
  return seed
}

export async function ResolvedSharedSeo({ resolve }: { resolve: Promise<SharedResolveResult> }) {
  const result = await resolve
  if (!result.ok || !result.seoEligible) return null
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(result.jsonLd) }}
      />
      <SharedPostStatic
        {...result.staticPost}
        below={
          result.related ? (
            <RelatedSaves
              platform={result.related.platform}
              bookmarkId={result.related.bookmarkId}
              authorHandle={result.related.authorHandle}
              contentType={result.related.contentType}
            />
          ) : undefined
        }
      />
    </>
  )
}

/**
 * Crawlable article + the new theater — preview pages share this tail. The
 * SEO sibling waits on the source inside Suspense; people see the theater's
 * loading screen straight away (`PreviewTheater`).
 */
export function SharedPreviewPage({
  jsonLd,
  staticPost,
  sharedItem,
  unavailable,
  sharedResolve,
}: {
  jsonLd?: unknown
  staticPost?: SharedPostStaticProps
  /** Kept for callers; the new theater builds its own queue. */
  seed?: TheaterFeedSeed
  /** The URL stub; its `url` is the original post, offered if it can't be shown. */
  sharedItem?: TheaterItem
  authed?: boolean
  unavailable?: boolean
  /** Upstream resolve — do not await in the page; the shell paints first. */
  sharedResolve?: Promise<SharedResolveResult>
}) {
  if (unavailable) return <PreviewTheater unavailable />
  return (
    <>
      {sharedResolve ? (
        <Suspense fallback={null}>
          <ResolvedSharedSeo resolve={sharedResolve} />
        </Suspense>
      ) : jsonLd != null && staticPost ? (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
          />
          <SharedPostStatic {...staticPost} />
        </>
      ) : null}
      <PreviewTheater resolve={sharedResolve} originalUrl={sharedItem?.url} />
    </>
  )
}
