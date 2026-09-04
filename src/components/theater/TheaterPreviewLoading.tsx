import { MatterLogo } from '@/components/matter'
import { StageResolving } from './StageResolving'

/**
 * Segment `loading.tsx` fallback for preview routes. This is intentionally a
 * side-effect-free visual shell rather than TheaterShell itself: a loading
 * boundary must not run autosave, pulse, or queue effects before moderation
 * and route validation finish.
 */
export function TheaterPreviewLoading() {
  return (
    <div
      className="theater-shell-viewport fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#08070a]"
      data-testid="theater-preview-loading-shell"
    >
      <div className="relative h-full w-full flex-1 overflow-hidden">
        <div className="absolute inset-0" data-testid="theater-stage">
          <StageResolving />
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden items-center justify-between px-7 pb-10 pt-4 lg:flex"
          data-testid="theater-loading-desktop-chrome"
          style={{ background: 'linear-gradient(rgba(8,7,10,.62), transparent)' }}
        >
          <MatterLogo size={19} surface="dark" />
          <div className="flex items-center gap-2.5" aria-hidden>
            <span className="h-10 w-10 rounded-full border border-white/15 bg-white/[.08]" />
            <span className="h-10 w-10 rounded-full border border-white/15 bg-white/[.08]" />
          </div>
        </div>

        <div
          className="theater-mobile-top-chrome pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))] lg:hidden"
          data-testid="theater-loading-mobile-chrome"
          style={{ background: 'linear-gradient(rgba(8,7,10,.7), transparent)' }}
        >
          <MatterLogo size={16} surface="dark" />
          <span
            className="h-10 w-10 rounded-full border border-white/15 bg-white/[.08]"
            aria-hidden
          />
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden h-28 border-t border-white/10 bg-black/55 backdrop-blur-xl lg:block"
          aria-hidden
        >
          <div className="flex h-full items-center gap-3 px-7">
            <span className="h-10 w-32 rounded-full bg-white/[.08]" />
            <span className="h-16 w-28 rounded-xl bg-white/[.08]" />
            <span className="h-16 w-28 rounded-xl bg-white/[.06]" />
          </div>
        </div>

        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[calc(4.25rem+env(safe-area-inset-bottom))] border-t border-white/15 bg-[#121117]/85 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden"
          data-testid="theater-loading-mobile-dock"
          aria-hidden
        >
          <div className="flex h-11 items-center justify-between">
            <span className="h-9 w-16 rounded-full bg-white/[.08]" />
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-full bg-white/[.08]" />
              <span className="h-10 w-10 rounded-full bg-white/[.12]" />
              <span className="h-8 w-8 rounded-full bg-white/[.08]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
