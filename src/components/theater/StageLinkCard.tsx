'use client'

import { useState } from 'react'
import type { TheaterLinkPreview } from '@/lib/trending/query'

/**
 * Publisher card for a tweet that wraps an external URL. Same role as X's
 * own link preview: cover + title + domain, tappable as a whole. Text runs
 * are wrapped in <span> for translation safety.
 */
export function StageLinkCard({ preview }: { preview: TheaterLinkPreview }) {
  const [imgFailed, setImgFailed] = useState(false)
  const domain = preview.domain || ''
  const title = (preview.title || '').trim()
  const description = (preview.description || '').trim()
  const showImage = !!preview.imageUrl && !imgFailed

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className="mt-6 block overflow-hidden rounded-2xl border border-white/15 bg-white/[0.04] text-left transition-colors hover:border-white/25 hover:bg-white/[0.06]"
    >
      {showImage ? (
        <img
          src={preview.imageUrl!}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="aspect-[16/10] w-full object-cover"
        />
      ) : null}
      <div className="px-4 py-3">
        {title ? (
          <p className="font-serif text-lg leading-snug text-white">
            <span>{title}</span>
          </p>
        ) : null}
        {description ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/55">
            <span>{description}</span>
          </p>
        ) : null}
        {domain ? (
          <p className="mt-2 truncate font-mono text-[11px] uppercase tracking-wide text-white/40">
            <span>{domain}</span>
          </p>
        ) : null}
      </div>
    </a>
  )
}
