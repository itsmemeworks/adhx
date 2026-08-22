'use client'

/**
 * Global keydown handling for TheaterShell. One keymap: ↓/↑/j/k/←/→/space/m
 * for every theater surface (Live, collection, playlist, shared). Collection
 * adds U (undo Archive) via `personalKeyAction`. Escape closes the personal
 * overlay. `personalKeyAction` is re-exported from TheaterShell for tests.
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

export type PersonalKeyAction = 'undo' | 'close'

/**
 * Collection-tab extras on top of the Live keymap (arrows / space / m).
 * Archive is a button, not a key — same transport as Live. U still undoes
 * the last Archive; Escape closes the overlay.
 */
export function personalKeyAction(e: PersonalKeyLike): PersonalKeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (isPersonalTypingTarget(e.target)) return null
  switch (e.key) {
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

      // Collection tab uses the same ↓/↑/←/→/space/m nav as Live. U undoes
      // Archive; Escape closes the overlay (also handled for the Live tab
      // just below).
      if (isPersonal && personalTab === 'collection') {
        const action = personalKeyAction(e)
        if (action === 'undo') {
          e.preventDefault()
          undoLastAction()
          return
        }
        if (action === 'close') {
          e.preventDefault()
          onClose?.()
          return
        }
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
  }, [goNext, goPrev, isPersonal, personalTab, undoLastAction, onClose, isPlaybackHidden])
}
