'use client'

import { Clipboard, RefreshCw, TrendingUp } from 'lucide-react'
import { useAuthMe } from '@/components/auth'
import { ConnectWithX, PlatformGlyph } from '@/components/matter'
import { PasteLinkButton } from '@/components/PasteLinkButton'
import { StarterCollections } from '@/components/onboarding/StarterCollections'
import { cn } from '@/lib/utils'

/**
 * First-run onboarding for a brand-new account with zero bookmarks total
 * (not just zero unread — see FeedGrid's `stats.total === 0` check). Email-only
 * signups skip the X-OAuth `?firstLogin=true` sync modal entirely, so without
 * this they land on a bare "no unread bookmarks" message with nothing to do.
 */
export function EmptyAccountOnboarding(): React.ReactElement {
  const { me } = useAuthMe()
  const xConnected = me?.xConnected ?? false

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <h3 className="font-serif text-2xl font-semibold text-ink mb-2">
        Let&apos;s fill your collection
      </h3>
      <p className="text-ink-2 max-w-md mb-8">
        Your collection is empty for now — connect X, paste a link, or see what everyone else is
        saving right now.
      </p>

      <div className="grid gap-3 w-full max-w-md">
        {xConnected ? (
          <OnboardingAction
            icon={<RefreshCw className="w-5 h-5" />}
            title="Sync your X bookmarks"
            description="Pull in everything you've already bookmarked on X."
            onClick={() => window.dispatchEvent(new CustomEvent('open-sync'))}
            primary
          />
        ) : (
          <OnboardingAction
            icon={<PlatformGlyph platform="x" size={18} />}
            title={<ConnectWithX size={15} />}
            description="Import your existing X bookmarks in one click."
            href="/api/auth/twitter"
            primary
          />
        )}

        {/* Desktop: ⌘V/Ctrl+V paste-to-preview (global listener, see
            PasteToPreview). Mobile Safari has no paste gesture, so the
            mobile build swaps this for the actual one-tap Paste link
            button instead of a description of a shortcut that doesn't
            apply there. */}
        <div className="hidden sm:block">
          <OnboardingAction
            icon={<Clipboard className="w-5 h-5" />}
            title="Paste a link"
            description="Copy an X, Instagram, TikTok, or YouTube link, then paste it (⌘V / Ctrl+V) anywhere on this page — we'll show a preview to save."
          />
        </div>
        <div className="sm:hidden">
          <OnboardingAction
            icon={<Clipboard className="w-5 h-5" />}
            title="Paste a link"
            description="Copy an X, Instagram, TikTok, or YouTube link from any share sheet, then tap below."
            actionSlot={<PasteLinkButton className="mt-3 w-full justify-center" />}
          />
        </div>

        <OnboardingAction
          icon={<TrendingUp className="w-5 h-5" />}
          title="Explore what's trending"
          description="See what the community is saving and sending right now."
          href="/trending"
        />
      </div>

      {/* Collapses to nothing when there are no public collections to offer —
          the save-methods cards above are already a complete onboarding
          path on their own. See StarterCollections' own doc. */}
      <div className="mt-10 w-full max-w-2xl">
        <StarterCollections compact />
      </div>
    </div>
  )
}

interface OnboardingActionProps {
  icon: React.ReactNode
  title: React.ReactNode
  description: string
  href?: string
  onClick?: () => void
  primary?: boolean
  /**
   * An interactive control rendered below the description, for actions that
   * need real state (e.g. `PasteLinkButton`'s idle/resolving/error clipboard
   * flow) rather than a static `href`/`onClick`. Never combine with
   * `href`/`onClick` — the card itself must stay a plain, non-interactive
   * wrapper so the nested control isn't inside another link/button.
   */
  actionSlot?: React.ReactNode
}

function OnboardingAction({
  icon,
  title,
  description,
  href,
  onClick,
  primary = false,
  actionSlot,
}: OnboardingActionProps): React.ReactElement {
  const content = (
    <div className="flex items-start gap-3 text-left">
      <span
        className={cn(
          'flex-none w-10 h-10 rounded-full flex items-center justify-center',
          primary ? 'bg-ink text-surface' : 'bg-inset text-ink-2',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        {title && <span className="block font-semibold text-ink text-[14.5px]">{title}</span>}
        <span className="block text-[13px] text-ink-2 mt-0.5">{description}</span>
        {actionSlot}
      </span>
    </div>
  )

  const className = cn(
    'w-full rounded-card border border-hairline bg-surface px-4 py-3.5 shadow-m-sm transition-colors',
    (href || onClick) && 'hover:border-clay/50 cursor-pointer',
  )

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}
