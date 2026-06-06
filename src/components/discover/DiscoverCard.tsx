'use client'

import { Plus, Play, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { PlatformGlyph, TypeBadge, type ContentType } from '@/components/matter'
import type { ActivityItem } from './DiscoverFeed'

/**
 * Infer a TypeBadge type from the (limited) activity payload.
 * We don't store the exact post type, so approximate:
 *   tiktok / youtube / instagram → always video (they ship no poster of their
 *     own, so keying off the thumbnail would wrongly classify them as text)
 *   twitter / other              → media thumbnail ⇒ photo, otherwise text
 */
export function inferType(item: ActivityItem): ContentType {
  if (item.platform === 'tiktok' || item.platform === 'youtube' || item.platform === 'instagram') {
    return 'video'
  }
  return item.thumbnailUrl ? 'photo' : 'text'
}

/**
 * A single Discover grid card (Matter direction).
 *
 * Flex column with a `mt-auto` footer so the anonymous-identity + Save row is
 * ALWAYS pinned to the bottom of the card regardless of body length, keeping
 * the uniform grid visually even.
 *
 * Anonymous by design: the SAVER is never shown — only an incognito avatar and
 * "Someone · {time} · <platform>". The content `author` may appear in the body.
 */
export function DiscoverCard({ item, fresh = false }: { item: ActivityItem; fresh?: boolean }) {
  const type = inferType(item)
  const hasMedia = Boolean(item.thumbnailUrl)
  const isVideo = type === 'video'
  const who = item.authorName || (item.author ? `@${item.author}` : null)

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-card border bg-surface shadow-m-sm transition-colors duration-700',
        fresh ? 'border-clay/40 bg-clay/[0.08]' : 'border-hairline',
      )}
    >
      {hasMedia ? (
        <div className="relative">
          <img
            src={item.thumbnailUrl!}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="block aspect-[4/3] w-full bg-inset object-cover"
          />
          <div className="absolute left-2.5 top-2.5">
            <TypeBadge type={type} />
          </div>
          <span className="absolute right-2.5 top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
            <PlatformGlyph platform={item.platform} size={13} />
          </span>
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
                <Play size={18} fill="currentColor" />
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 px-4 pt-4">
          <TypeBadge type={type} />
          <p className="mt-3 line-clamp-5 text-[14.5px] leading-relaxed text-ink">
            {item.text || (who ? `Saved from ${who}` : 'Saved post')}
          </p>
        </div>
      )}

      {/* bottom-pinned footer */}
      <div className="mt-auto flex items-center gap-2.5 px-3.5 py-3">
        <span
          className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border border-hairline bg-inset text-ink-3"
          title="Saved anonymously"
        >
          <EyeOff size={12} />
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-ink-3">
          <span>Someone</span>
          <span aria-hidden>·</span>
          <span>{formatCompactRelativeTime(item.createdAt)}</span>
          <span aria-hidden>·</span>
          <PlatformGlyph platform={item.platform} size={12} />
        </span>
        <a
          href={item.url}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-clay-grad px-3.5 py-2 text-[13px] font-semibold text-white shadow-glow transition-opacity duration-150 hover:opacity-90"
        >
          <Plus size={14} />
          Save
        </a>
      </div>
    </article>
  )
}
