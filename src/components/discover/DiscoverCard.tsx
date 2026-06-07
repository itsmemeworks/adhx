'use client'

import { Plus, Play, EyeOff, Flame, ExternalLink, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { PlatformGlyph, PlatformChip, TypeBadge, type ContentType } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
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
  // A Twitter *video* poster (ext_tw_video_thumb / amplify_video_thumb / the
  // tweet_video_thumb used for GIFs) isn't a photo — only `/media/` URLs are.
  // Matters for preview-only items, where the server can't derive the type.
  if (item.thumbnailUrl && /(ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)/.test(item.thumbnailUrl)) {
    return 'video'
  }
  return item.thumbnailUrl ? 'photo' : 'text'
}

/**
 * A single Discover grid card (Matter direction), rendered per content type.
 * The media/article/text area flex-fills so the footer is bottom-pinned and
 * aligns across the equal-height grid regardless of card type.
 *
 * Anonymous by design: the SAVER is never shown — only an incognito avatar +
 * time + platform in the footer. Text/quote cards show the *original* post's
 * author (avatar + @handle) tweet-style.
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
  const isMedia = type === 'video' || type === 'photo'
  const isArticle = type === 'article'
  const isVideo = type === 'video'
  const hasThumb = Boolean(item.thumbnailUrl)
  const caption = (item.text || '').trim()
  const time = formatCompactRelativeTime(item.createdAt)

  const saveCount = item.saveCount ?? 0
  const hot = saveCount >= 2
  const FlameBadge = hot ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-flame px-2 py-0.5 text-[11.5px] font-bold text-white shadow-sm">
      <Flame size={12} fill="currentColor" />
      {saveCount}
    </span>
  ) : null

  const TopRight = (
    <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
      {FlameBadge}
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
        <PlatformGlyph platform={item.platform} size={13} />
      </span>
    </div>
  )

  let body: React.ReactNode
  if (isMedia) {
    body = (
      <div className="relative flex flex-1 min-h-[200px]">
        {hasThumb ? (
          <img
            src={item.thumbnailUrl!}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="absolute inset-0 h-full w-full bg-inset object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-ink to-[#15110d]" />
        )}
        {caption && (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(transparent 42%, rgba(11,11,17,.84))' }}
            aria-hidden
          />
        )}
        <div className="absolute left-2.5 top-2.5">
          <TypeBadge type={type} />
        </div>
        {TopRight}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
              <Play size={18} fill="currentColor" />
            </span>
          </div>
        )}
        {caption && (
          <div className="absolute inset-x-0 bottom-0 px-3.5 pb-3 pt-8">
            <p className="line-clamp-2 text-[13.5px] font-medium leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,.55)]">
              {caption}
            </p>
          </div>
        )}
      </div>
    )
  } else if (isArticle && hasThumb) {
    body = (
      <div className="relative flex flex-1 min-h-[210px]">
        <img
          src={item.thumbnailUrl!}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="absolute inset-0 h-full w-full bg-inset object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(transparent 30%, rgba(11,11,17,.86))' }}
          aria-hidden
        />
        <div className="absolute left-2.5 top-2.5">
          <TypeBadge type="article" />
        </div>
        {TopRight}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3.5 pt-8">
          <h3 className="font-serif font-semibold text-[17px] leading-tight text-white line-clamp-3 [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">
            {caption || 'Article'}
          </h3>
        </div>
      </div>
    )
  } else if (isArticle) {
    body = (
      <div className="relative flex flex-1 min-h-[200px] flex-col overflow-hidden p-4 bg-gradient-to-br from-clay/[0.14] to-surface">
        <FileText className="absolute -right-5 -bottom-[22px] w-[120px] h-[120px] text-clay/[0.13]" aria-hidden />
        <div className="relative flex items-center gap-1.5">
          <TypeBadge type="article" />
          <PlatformChip platform={item.platform} />
        </div>
        <h3 className="relative mt-3.5 font-serif font-semibold text-[18px] leading-tight text-ink line-clamp-4">
          {caption || 'Article'}
        </h3>
      </div>
    )
  } else {
    // text / quote — tweet style (original poster's avatar + handle).
    body = (
      <div className="flex-1 px-4 pt-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <AuthorAvatar src={item.authorAvatarUrl ?? item.thumbnailUrl} author={item.author} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold text-[13.5px] text-ink">
              {item.authorName || (item.author ? `@${item.author}` : 'Saved post')}
            </div>
            {item.author && <div className="truncate font-mono text-[11.5px] text-ink-3">@{item.author}</div>}
          </div>
          <PlatformChip platform={item.platform} />
        </div>
        <p className="line-clamp-4 text-[14.5px] leading-relaxed text-ink">{caption || 'Saved post'}</p>
      </div>
    )
  }

  return (
    <article
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-card border bg-surface shadow-m-sm transition-colors duration-700',
        fresh ? 'border-clay/40 bg-clay/[0.08]' : 'border-hairline',
      )}
    >
      {/* The whole tile links to the on-ADHX preview page. */}
      <a href={item.url} className="flex flex-1 flex-col">
        {body}
      </a>

      {/* Bottom-pinned anonymous footer (aligned across the equal-height grid). */}
      <div className="mt-auto flex items-center gap-2.5 px-3.5 py-3">
        <span
          className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border border-hairline bg-inset text-ink-3"
          title="Saved anonymously"
        >
          <EyeOff size={12} />
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-ink-3">
          <span>{time}</span>
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
