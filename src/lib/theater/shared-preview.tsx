import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SharedPostStatic, type SharedPostStaticProps } from '@/components/theater/SharedPostStatic'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { RelatedSaves } from '@/components/RelatedSaves'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'
import { buildSharedSeed } from './shared-seed'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import type { SharedResolveResult } from './shared-resolve'

export { recordHumanPreview } from './record-human-preview'

export const MODERATED_PAGE_METADATA: Metadata = {
  title: 'Post removed - ADHX',
  description: 'This post was removed from ADHX.',
  robots: { index: false },
}

export async function sharedPreviewSeed(sharedItem: TheaterItem): Promise<TheaterFeedSeed> {
  const { seed } = await buildSharedSeed(sharedItem)
  return seed
}

async function ResolvedSharedSeo({ resolve }: { resolve: Promise<SharedResolveResult> }) {
  const result = await resolve
  if (!result.ok) return null
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

/** Crawlable article + theater — preview pages share this tail. */
export function SharedPreviewPage({
  jsonLd,
  staticPost,
  seed,
  sharedItem,
  authed,
  unavailable,
  sharedResolve,
}: {
  jsonLd?: unknown
  staticPost?: SharedPostStaticProps
  seed: TheaterFeedSeed
  sharedItem: TheaterItem
  authed: boolean
  unavailable?: boolean
  /** Upstream resolve — do not await in the page; the shell paints first. */
  sharedResolve?: Promise<SharedResolveResult>
}) {
  if (unavailable) {
    return (
      <TheaterShell
        seed={seed}
        mode="shared"
        sharedItem={sharedItem}
        sharedUnavailable
        sharedUnavailableReason="hidden"
        authed={authed}
      />
    )
  }
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
      <TheaterShell
        seed={seed}
        mode="shared"
        sharedItem={sharedItem}
        sharedResolve={sharedResolve}
        authed={authed}
      />
    </>
  )
}
