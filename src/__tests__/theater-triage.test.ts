/**
 * @vitest-environment jsdom
 *
 * Pure logic backing collection mode's Collection tab
 * (docs/specs/unified-theater-collection.md §2) — the same map the deleted
 * `CollectionTheater.tsx`'s `collectionKeyAction()` reproduced from the old
 * `CollectionMode.tsx`, now living on `TheaterShell` since the collection theater is folded into
 * the one shell. `ArrowUp` = Back is new (the old map deliberately left it
 * unbound — this task adds pure navigation distinct from `U` undo).
 */
import { describe, it, expect } from 'vitest'
import {
  personalKeyAction,
  shouldCommitDelete,
  shouldDismissUndo,
  personalAdvance,
  personalAdvanceOnEndedIndex,
  personalStepBackIndex,
  type PersonalUndoAction,
} from '@/components/theater/TheaterShell'

describe('personalKeyAction', () => {
  it('only maps undo and close — arrows are the Live keymap', () => {
    expect(personalKeyAction({ key: 'u' })).toBe('undo')
    expect(personalKeyAction({ key: 'U' })).toBe('undo')
    expect(personalKeyAction({ key: 'Escape' })).toBe('close')
    expect(personalKeyAction({ key: 'ArrowRight' })).toBe(null)
    expect(personalKeyAction({ key: 'ArrowLeft' })).toBe(null)
    expect(personalKeyAction({ key: 'ArrowDown' })).toBe(null)
    expect(personalKeyAction({ key: 'Delete' })).toBe(null)
  })

  it('ignores unmapped keys', () => {
    expect(personalKeyAction({ key: 'q' })).toBe(null)
    expect(personalKeyAction({ key: 'Enter' })).toBe(null)
  })

  it('ignores keys with a modifier held', () => {
    expect(personalKeyAction({ key: 'u', metaKey: true })).toBe(null)
    expect(personalKeyAction({ key: 'Escape', ctrlKey: true })).toBe(null)
    expect(personalKeyAction({ key: 'u', altKey: true })).toBe(null)
  })

  it('ignores keys typed into an input, textarea, or contentEditable element', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })

    expect(personalKeyAction({ key: 'u', target: input })).toBe(null)
    expect(personalKeyAction({ key: 'u', target: textarea })).toBe(null)
    expect(personalKeyAction({ key: 'u', target: editable })).toBe(null)
  })

  it('still acts on a non-typing target', () => {
    const div = document.createElement('div')
    expect(personalKeyAction({ key: 'u', target: div })).toBe('undo')
  })
})

function feedItem(id: string) {
  return { id, platform: 'twitter' } as unknown as import('@/components/feed/types').FeedItem
}

describe('shouldCommitDelete', () => {
  it('is true only for a pending "delete" undo', () => {
    const del: PersonalUndoAction = { type: 'delete', item: feedItem('1'), index: 0 }
    const archive: PersonalUndoAction = { type: 'archive', item: feedItem('1'), index: 0 }
    const keep: PersonalUndoAction = { type: 'keep', item: feedItem('1'), index: 0 }
    expect(shouldCommitDelete(del)).toBe(true)
    expect(shouldCommitDelete(archive)).toBe(false)
    expect(shouldCommitDelete(keep)).toBe(false)
    expect(shouldCommitDelete(null)).toBe(false)
  })
})

describe('shouldDismissUndo', () => {
  it('dismisses when the timer is still the current undo (identity match)', () => {
    const action: PersonalUndoAction = { type: 'archive', item: feedItem('1'), index: 0 }
    expect(shouldDismissUndo(action, action)).toBe(true)
  })

  it('does NOT dismiss a stale timer once a newer action has replaced it', () => {
    const stale: PersonalUndoAction = { type: 'archive', item: feedItem('1'), index: 0 }
    const fresh: PersonalUndoAction = { type: 'keep', item: feedItem('2'), index: 1 }
    expect(shouldDismissUndo(fresh, stale)).toBe(false)
  })

  it('does not dismiss when the toast has already been cleared (null)', () => {
    const stale: PersonalUndoAction = { type: 'archive', item: feedItem('1'), index: 0 }
    expect(shouldDismissUndo(null, stale)).toBe(false)
  })

  it('treats two value-equal but distinct actions as different (identity, not deep equality)', () => {
    const a: PersonalUndoAction = { type: 'keep', item: feedItem('1'), index: 0 }
    const b: PersonalUndoAction = { type: 'keep', item: feedItem('1'), index: 0 }
    expect(shouldDismissUndo(b, a)).toBe(false)
  })
})

describe('personalAdvance / personalStepBackIndex', () => {
  it('advance always steps forward one, regardless of which action fired', () => {
    expect(personalAdvance(0)).toBe(1)
    expect(personalAdvance(4)).toBe(5)
  })

  it('back steps to the previous item but never below 0', () => {
    expect(personalStepBackIndex(3)).toBe(2)
    expect(personalStepBackIndex(0)).toBe(0)
  })
})

describe('personalAdvanceOnEndedIndex', () => {
  it('walks past the last item when repeat is off so All Clear can render', () => {
    expect(personalAdvanceOnEndedIndex(2, 3, 'off')).toBe(3)
  })

  it('wraps to the start when repeat is the whole queue', () => {
    expect(personalAdvanceOnEndedIndex(2, 3, 'all')).toBe(0)
    expect(personalAdvanceOnEndedIndex(0, 3, 'all')).toBe(1)
  })

  it('stays on the current post when repeat is one', () => {
    expect(personalAdvanceOnEndedIndex(1, 3, 'one')).toBe(1)
  })
})
