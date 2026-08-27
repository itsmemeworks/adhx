/**
 * Segment `loading.tsx` fallback for preview routes. Same near-black stage
 * as TheaterShell so the first byte of an external link is ADHX, not a
 * blank document waiting on FxTwitter / a media mirror.
 */
export function TheaterPreviewLoading() {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[#08070a] px-6"
      role="status"
      aria-label="Loading post"
    >
      <img src="/gob-loader.svg" alt="" aria-hidden className="h-[88px] w-[88px]" />
      <p className="font-indie-flower text-[22px] text-[#F4F1EA]">
        <span>grabbing it…</span>
      </p>
    </div>
  )
}
