'use client'

import { Plus, Play, EyeOff, Flame, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { PlatformGlyph, TypeBadge, type ContentType } from '@/components/matter'
import type { ActivityItem } from './DiscoverFeed'

/**
 * The post's type for the badge. Prefer the real `contentType` resolved server
 * side from the saved bookmark; otherwise fall back to a heuristic:
 *   tiktok / youtube / instagram → video (single-format platforms)
 *   an avatar/profile image is NOT real media → text
 *   any other thumbnail ⇒ photo, otherwise text
 */
export function inferType(item: ActivityItem): ContentType {
  if (item.contentType) return item.contentType
  if (item.platform === 'tiktok' || item.platform === 'youtube' || item.platform === 'instagram') {
    return 'video'
  }
  if (item.thumbnailUrl && /profile_images/.test(item.thumbnailUrl)) return 'text'
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
export function DiscoverCard({
  item,
  fresh = false,
  pub = false,
}: {
  item: ActivityItem
  fresh?: boolean
  /** Public (signed-out) Discover — the action reads "Preview" instead of "Save". */
  pub?: boolean
}) {
  const type = inferType(item)
  const hasThumb = Boolean(item.thumbnailUrl)
  const isVideo = type === 'video'
  const who = item.authorName || (item.author ? `@${item.author}` : null)
  // "Hot" = saved by more than one person across ADHX. Shows a flame + count.
  const saveCount = item.saveCount ?? 0
  const hot = saveCount >= 2
  const FlameBadge = hot ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-flame px-2 py-0.5 text-[11.5px] font-bold text-white shadow-sm">
      <Flame size={12} fill="currentColor" />
      {saveCount}
    </span>
  ) : null

  // Overlaid badges shared by the thumbnail + poster-less video tiles.
  const Overlays = (
    <>
      <div className="absolute left-2.5 top-2.5">
        <TypeBadge type={type} />
      </div>
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
        {FlameBadge}
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
          <PlatformGlyph platform={item.platform} size={13} />
        </span>
      </div>
    </>
  )

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-card border bg-surface shadow-m-sm transition-colors duration-700',
        fresh ? 'border-clay/40 bg-clay/[0.08]' : 'border-hairline',
      )}
    >
      {/* Whole tile is a link to the on-ADHX preview page. */}
      <a href={item.url} className="flex flex-1 flex-col">
        {hasThumb ? (
          <div className="relative">
            <img
              src={item.thumbnailUrl!}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="block aspect-[4/3] w-full bg-inset object-cover"
            />
            {Overlays}
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
                  <Play size={18} fill="currentColor" />
                </span>
              </div>
            )}
          </div>
        ) : isVideo ? (
          // Video with no poster (e.g. TikTok) — dark placeholder with a play
          // glyph + the caption, so it still reads as a playable video tile.
          <div className="relative flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-ink to-[#15110d]">
            {Overlays}
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md">
              <Play size={18} fill="currentColor" />
            </span>
            {item.text && (
              <p className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-6 text-[12.5px] font-medium text-white/90">
                {item.text}
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 px-4 pt-4">
            <div className="flex items-center gap-2">
              <TypeBadge type={type} />
              {FlameBadge}
            </div>
            <p className="mt-3 line-clamp-5 text-[14.5px] leading-relaxed text-ink">
              {item.text || (who ? `Saved from ${who}` : 'Saved post')}
            </p>
          </div>
        )}
      </a>

      {/* bottom-pinned footer */}
      <div className="mt-auto flex items-center gap-2.5 px-3.5 py-3">
        <span
          className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border border-hairline bg-inset text-ink-3"
          title="Saved anonymously"
        >
          <EyeOff size={12} />
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-ink-3">
          <span>{formatCompactRelativeTime(item.createdAt)}</span>
          <span aria-hidden>·</span>
          <PlatformGlyph platform={item.platform} size={12} />
        </span>
        <a
          href={item.url}
          className="ml-auto flex-none inline-flex items-center gap-1.5 rounded-full bg-clay-grad px-3.5 py-2 text-[13px] font-semibold text-white shadow-glow transition-opacity duration-150 hover:opacity-90"
        >
          {pub ? (
            <>
              Preview
              <ExternalLink size={13} />
            </>
          ) : (
            <>
              <Plus size={14} />
              Save
            </>
          )}
        </a>
      </div>
    </article>
  )
}
