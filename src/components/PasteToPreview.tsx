'use client'

import { useEffect, useRef } from 'react'
import { resolvePastedPost } from '@/lib/theater/paste-preview'

/**
 * Navigate to an app-internal path only. `resolvePastedLink` already only
 * builds root-relative app paths, but the pasted text is user/clipboard
 * input, so the sink enforces the invariant too (defense-in-depth, and what
 * proves it to CodeQL: no `javascript:` scheme can survive the leading-`/`
 * requirement, no protocol-relative `//host` escape, and the resolved URL
 * must land on this origin). Exported for unit testing. Mirrors
 * `navigateToAppPath` in `TheaterDesktopChrome.tsx`.
 */
export function navigateToAppPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return
  const dest = new URL(path, window.location.origin)
  if (dest.origin !== window.location.origin) return
  window.location.assign(dest.toString())
}

export interface PasteToPreviewProps {
  /**
   * Handle the pasted post HERE instead of navigating to its preview page.
   * The library passes this so a paste adds the post to the collection in
   * place — owner: "if I'm on my library and then I just paste a new link to
   * a post, it should simply just add it straight away at the top of my
   * library. Nothing else needs to happen." Receives the url as pasted;
   * already validated as a supported post link.
   */
  onPastePost?: (url: string) => void
}

/**
 * Global paste-to-add: the authed Collection has no `+` Add button anymore
 * (see docs/specs/unified-theater-triage.md §1) — pasting a platform URL
 * anywhere outside an input/textarea/contenteditable is picked up here.
 * Default action is to route to the post's preview page (same as the
 * theater's paste-a-link input); a caller that would rather act in place
 * passes `onPastePost`. No UI of its own either way.
 */
export function PasteToPreview({ onPastePost }: PasteToPreviewProps = {}): null {
  // Read through a ref so the listener never re-registers on an identity
  // change in the caller's handler (it closes over feed state).
  const handlerRef = useRef(onPastePost)
  handlerRef.current = onPastePost

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return

      const target = e.target as HTMLElement | null
      if (
        isEditableTarget(target) ||
        isEditableTarget(document.activeElement as HTMLElement | null)
      ) {
        return
      }

      const text = e.clipboardData?.getData('text')?.trim()
      if (!text) return

      const pasted = resolvePastedPost(text)
      if (!pasted) return
      const handle = handlerRef.current
      if (handle) {
        handle(pasted.url)
        return
      }
      navigateToAppPath(pasted.path)
    }

    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  return null
}

function isEditableTarget(el: HTMLElement | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
