'use client'

/**
 * Global keydown handling for TheaterShell. One keymap for every theater
 * surface (Live, collection, playlist, shared): →/←/j/k next-prev, ↑/↓
 * scroll text, 1/2 Live⇄Saved (signed-in), Space play/pause, M mute,
 * E expand, R repeat, Q Queue, Shift+Q filter, S/T/L/C/D/O/A/F/W/P action buttons,
 * . menu, Shift+? help.
 * Collection still has U (undo Archive) and Escape (close). `personalKeyAction`
 * is re-exported from TheaterShell for tests.
 */

import { useEffect } from 'react'
import type { PersonalTab } from './types'
import {
  THEATER_ACTION_EVENTS,
  isTheaterTypingTarget,
  resolveTheaterShortcut,
  scrollTheaterStage,
  type TheaterKeyLike,
} from './theater-shortcuts'

export interface PersonalKeyLike extends TheaterKeyLike {}

export type PersonalKeyAction = 'undo' | 'close'

/**
 * Collection-tab extras on top of the Live keymap (arrows / space / m).
 * Archive is a button (A), not a dedicated collection-only key. U still
 * undoes the last Archive; Escape closes the overlay (or the help sheet).
 */
export function personalKeyAction(e: PersonalKeyLike): PersonalKeyAction | null {
  const action = resolveTheaterShortcut(e)
  if (action === 'undo' || action === 'close') return action
  return null
}

export interface UseTheaterKeyboardArgs {
  /** Disable every global shortcut while AppShell's server/client auth scopes differ. */
  disabled?: boolean
  /** Reports the actual lifetime of the global keydown listener. */
  onReadyChange?: (ready: boolean) => void
  isPersonal: boolean
  personalTab: PersonalTab
  goNext: () => void
  goPrev: () => void
  undoLastAction: () => void
  onClose?: () => void
  /**
   * Live ⇄ Saved (signed-in). Omitted where those controls don't exist —
   * 1/2 no-op. Shared+authed uses the same callback the tab pill does
   * (`2` → `/saved`).
   */
  onTabChange?: (tab: PersonalTab) => void
  helpOpen?: boolean
  onToggleHelp?: () => void
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
 * Keyboard nav: →/j next, ←/k prev. ↑/↓ scroll a text/article stage so
 * reading never needs the mouse (they do not change posts). Space toggles
 * play/pause (video stages and the 10s timed dwell, via `theater-toggle-play`),
 * m toggles mute.
 * Letter keys fire the matching action button through `theater-*` window
 * events so only the visible chrome (desktop vs mobile) handles them.
 * Ignored while typing in an input/textarea/contentEditable element.
 * ⌘V / Ctrl+V is the OS paste event, not a keydown binding.
 */
export function useTheaterKeyboard({
  disabled = false,
  onReadyChange,
  isPersonal,
  personalTab,
  goNext,
  goPrev,
  undoLastAction,
  onClose,
  onTabChange,
  helpOpen,
  onToggleHelp,
  isPlaybackHidden,
}: UseTheaterKeyboardArgs): void {
  useEffect(() => {
    if (disabled) {
      onReadyChange?.(false)
      return
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isTheaterTypingTarget(e.target)) return

      const action = resolveTheaterShortcut(e)
      if (!action) return

      if (helpOpen) {
        if (action === 'toggleHelp' || action === 'close') {
          e.preventDefault()
          onToggleHelp?.()
        }
        return
      }

      if (action === 'toggleHelp') {
        e.preventDefault()
        onToggleHelp?.()
        return
      }

      if (action === 'close') {
        if (isPersonal) {
          e.preventDefault()
          onClose?.()
        }
        return
      }

      if (isPersonal && personalTab === 'collection' && action === 'undo') {
        e.preventDefault()
        undoLastAction()
        return
      }

      if (action === 'tabLive' || action === 'tabSaved') {
        if (!onTabChange) return
        e.preventDefault()
        onTabChange(action === 'tabLive' ? 'live' : 'collection')
        return
      }

      switch (action) {
        case 'next':
          e.preventDefault()
          goNext()
          break
        case 'prev':
          e.preventDefault()
          goPrev()
          break
        case 'scrollDown':
          e.preventDefault()
          scrollTheaterStage(1)
          break
        case 'scrollUp':
          e.preventDefault()
          scrollTheaterStage(-1)
          break
        case 'togglePlay':
          e.preventDefault()
          if (!isPlaybackHidden?.()) {
            window.dispatchEvent(new CustomEvent('theater-toggle-play'))
          }
          break
        case 'toggleMute':
        case 'save':
        case 'tag':
        case 'copyLink':
        case 'copyText':
        case 'sendFile':
        case 'open':
        case 'archive':
        case 'toggleMenu':
        case 'toggleShowAll':
        case 'toggleFilter':
        case 'toggleArticle':
        case 'replay':
        case 'keepPlaying':
        case 'toggleExpand':
        case 'cycleRepeat':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent(THEATER_ACTION_EVENTS[action]))
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    onReadyChange?.(true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      onReadyChange?.(false)
    }
  }, [
    disabled,
    goNext,
    goPrev,
    isPersonal,
    personalTab,
    undoLastAction,
    onClose,
    onReadyChange,
    onTabChange,
    helpOpen,
    onToggleHelp,
    isPlaybackHidden,
  ])
}
