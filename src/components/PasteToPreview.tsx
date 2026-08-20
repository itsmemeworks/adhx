'use client'

import { useEffect } from 'react'
import { resolvePastedLink } from '@/lib/theater/paste-preview'

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

/**
 * Global paste-to-add: the authed Collection has no `+` Add button anymore
 * (see docs/specs/unified-theater-triage.md §1) — pasting a platform URL
 * anywhere outside an input/textarea/contenteditable routes straight to its
 * preview page, same as the theater's paste-a-link input. No UI of its own.
 */
export function PasteToPreview(): null {
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

      const path = resolvePastedLink(text)
      if (path) navigateToAppPath(path)
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
