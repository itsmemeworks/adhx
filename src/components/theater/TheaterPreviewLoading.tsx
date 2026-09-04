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
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-black/85 to-transparent px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-8 lg:hidden"
          aria-hidden
        >
          <div className="ml-auto flex h-12 w-52 items-center justify-end gap-2 rounded-full border border-white/15 bg-white/[.08] px-2 backdrop-blur-xl">
            <span className="h-8 w-8 rounded-full bg-white/[.08]" />
            <span className="h-10 w-10 rounded-full bg-white/[.12]" />
            <span className="h-8 w-8 rounded-full bg-white/[.08]" />
          </div>
        </div>
      </div>
    </div>
  )
}
