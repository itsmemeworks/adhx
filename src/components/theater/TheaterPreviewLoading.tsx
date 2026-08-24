import { MatterLogo } from '@/components/matter'

/**
 * Segment `loading.tsx` fallback for preview routes. Same near-black stage
 * as TheaterShell so the first byte of an external link is ADHX, not a
 * blank document waiting on FxTwitter / a media mirror.
 */
export function TheaterPreviewLoading() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[#08070a] px-6">
      <MatterLogo size={22} className="[&>span]:text-white" />
      <p className="text-[13px] text-white/45">
        <span>Loading post</span>
      </p>
    </div>
  )
}
