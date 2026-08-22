'use client'

/**
 * Global keydown handling for TheaterShell (extracted verbatim — see
 * TheaterShell.tsx's "Keyboard nav" comment for the full rationale). Two
 * keymaps live here: the standard ↓/↑/j/k/←/→/space/m nav shared by
 * home/shared/collection modes and triage's own Live tab, and triage's
 * Collection tab's action-and-advance map (`triageKeyAction`, ported
 * verbatim from the deleted `CollectionTheater.tsx`'s `collectionKeyAction()`
 * — see docs/specs/unified-theater-triage.md §2). `triageKeyAction` and its
 * helpers are re-exported from `TheaterShell.tsx` so existing imports
 * (tests included) keep working unchanged.
 */

import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { TriageTab } from './types'

export interface TriageKeyLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  target?: EventTarget | null
}

function isTriageTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
}

export type TriageKeyAction = 'done' | 'later' | 'delete' | 'back' | 'undo' | 'close'

/**
 * Pure key → action mapping for triage mode's Collection tab
 * (docs/specs/unified-theater-triage.md §2). Preserves the deleted
 * `CollectionTheater.tsx`'s map VERBATIM — ArrowRight=Done, ArrowLeft=Later,
 * ArrowDown/Backspace/Delete=Delete, U=Undo, Escape=Close — and adds
 * ArrowUp=Back (step to the previous item without touching its read/delete
 * state; distinct from `U`, which reverses the *last* action).
 */
export function triageKeyAction(e: TriageKeyLike): TriageKeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (isTriageTypingTarget(e.target)) return null
  switch (e.key) {
    case 'ArrowRight':
      return 'done'
    case 'ArrowLeft':
      return 'later'
    case 'ArrowDown':
    case 'Backspace':
    case 'Delete':
      return 'delete'
    case 'ArrowUp':
      return 'back'
    case 'u':
    case 'U':
      return 'undo'
    case 'Escape':
      return 'close'
    default:
      return null
  }
}

export interface UseTheaterKeyboardArgs {
  isTriage: boolean
  triageTab: TriageTab
  goNext: () => void
  goPrev: () => void
  setMuted: Dispatch<SetStateAction<boolean>>
  triageDone: () => void
  triageLater: () => void
  triageDelete: () => void
  triageStepBack: () => void
  triageDoUndo: () => void
  onClose?: () => void
  /**
   * Space guard for the end-of-feed waiting stage: the stage stays MOUNTED
   * (paused) behind the waiting overlay so the persistent <video> element —
   * and its iOS unmuted-playback grant — survives into the next fresh
   * arrival. Space must not resume that hidden video underneath the "You're
   * all caught up" screen. Read at keypress time (a ref-backed callback),
   * so the listener never re-registers on waiting flips.
   */
  isPlaybackHidden?: () => boolean
}

/**
 * Keyboard nav: ↓/→/j next, ↑/←/k prev — the arrows double up because the
 * desktop dock's filmstrip queue reads horizontally while mobile still
 * scrolls vertically. Space toggles play/pause (delegated to Stage via a
 * custom event, matching the repo's cross-component keyboard pattern), m
 * toggles mute. Ignored while typing in an input/textarea/contentEditable
 * element.
 */
export function useTheaterKeyboard({
  isTriage,
  triageTab,
  goNext,
  goPrev,
  setMuted,
  triageDone,
  triageLater,
  triageDelete,
  triageStepBack,
  triageDoUndo,
  onClose,
  isPlaybackHidden,
}: UseTheaterKeyboardArgs): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Triage mode's Collection tab uses an entirely different keymap
      // (action-and-advance, not pure navigation) — see `triageKeyAction()`.
      // The Live tab keeps the standard ↓/↑/space/m nav below (it's the same
      // live pulse feed home mode uses), and Escape always closes the
      // overlay regardless of which triage tab is active.
      if (isTriage && triageTab === 'collection') {
        const action = triageKeyAction(e)
        if (!action) return
        e.preventDefault()
        switch (action) {
          case 'done':
            triageDone()
            break
          case 'later':
            triageLater()
            break
          case 'delete':
            triageDelete()
            break
          case 'back':
            triageStepBack()
            break
          case 'undo':
            triageDoUndo()
            break
          case 'close':
            onClose?.()
            break
        }
        return
      }

      if (isTriage && e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
        case 'j':
        case 'J':
          e.preventDefault()
          goNext()
          break
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'k':
        case 'K':
          e.preventDefault()
          goPrev()
          break
        case ' ':
          e.preventDefault()
          // See `isPlaybackHidden` — never resume the paused stage hiding
          // behind the waiting overlay.
          if (!isPlaybackHidden?.()) {
            window.dispatchEvent(new CustomEvent('theater-toggle-play'))
          }
          break
        case 'm':
        case 'M':
          e.preventDefault()
          setMuted((m) => !m)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    goNext,
    goPrev,
    isTriage,
    triageTab,
    triageDone,
    triageLater,
    triageDelete,
    triageStepBack,
    triageDoUndo,
    onClose,
    isPlaybackHidden,
  ])
}
