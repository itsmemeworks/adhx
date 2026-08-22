'use client'

/**
 * Global keydown handling for TheaterShell (extracted verbatim — see
 * TheaterShell.tsx's "Keyboard nav" comment for the full rationale). Two
 * keymaps live here: the standard ↓/↑/j/k/←/→/space/m nav shared by
 * home/shared/collection modes and the collection theater's own Live tab, and the collection theater's
 * Collection tab's action-and-advance map (`personalKeyAction`, ported
 * verbatim from the deleted `CollectionTheater.tsx`'s `collectionKeyAction()`
 * — see docs/specs/unified-theater-collection.md §2). `personalKeyAction` and its
 * helpers are re-exported from `TheaterShell.tsx` so existing imports
 * (tests included) keep working unchanged.
 */

import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PersonalTab } from './types'

export interface PersonalKeyLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  target?: EventTarget | null
}

function isPersonalTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
}

export type PersonalKeyAction = 'done' | 'later' | 'delete' | 'back' | 'undo' | 'close'

/**
 * Pure key → action mapping for collection mode's Collection tab
 * (docs/specs/unified-theater-collection.md §2). Preserves the deleted
 * `CollectionTheater.tsx`'s map VERBATIM — ArrowRight=Done, ArrowLeft=Later,
 * ArrowDown/Backspace/Delete=Delete, U=Undo, Escape=Close — and adds
 * ArrowUp=Back (step to the previous item without touching its read/delete
 * state; distinct from `U`, which reverses the *last* action).
 */
export function personalKeyAction(e: PersonalKeyLike): PersonalKeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (isPersonalTypingTarget(e.target)) return null
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
  isPersonal: boolean
  personalTab: PersonalTab
  goNext: () => void
  goPrev: () => void
  setMuted: Dispatch<SetStateAction<boolean>>
  archiveCurrent: () => void
  deferCurrent: () => void
  deleteCurrent: () => void
  personalStepBack: () => void
  undoLastAction: () => void
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
  isPersonal,
  personalTab,
  goNext,
  goPrev,
  setMuted,
  archiveCurrent,
  deferCurrent,
  deleteCurrent,
  personalStepBack,
  undoLastAction,
  onClose,
  isPlaybackHidden,
}: UseTheaterKeyboardArgs): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Collection mode's Collection tab uses an entirely different keymap
      // (action-and-advance, not pure navigation) — see `personalKeyAction()`.
      // The Live tab keeps the standard ↓/↑/space/m nav below (it's the same
      // live pulse feed home mode uses), and Escape always closes the
      // overlay regardless of which collection tab is active.
      if (isPersonal && personalTab === 'collection') {
        const action = personalKeyAction(e)
        if (!action) return
        e.preventDefault()
        switch (action) {
          case 'done':
            archiveCurrent()
            break
          case 'later':
            deferCurrent()
            break
          case 'delete':
            deleteCurrent()
            break
          case 'back':
            personalStepBack()
            break
          case 'undo':
            undoLastAction()
            break
          case 'close':
            onClose?.()
            break
        }
        return
      }

      if (isPersonal && e.key === 'Escape') {
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
    isPersonal,
    personalTab,
    archiveCurrent,
    deferCurrent,
    deleteCurrent,
    personalStepBack,
    undoLastAction,
    onClose,
    isPlaybackHidden,
  ])
}
