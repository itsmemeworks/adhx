/**
 * @vitest-environment jsdom
 *
 * Pure logic backing triage mode's Collection tab
 * (docs/specs/unified-theater-triage.md §2) — the same map the deleted
 * `CollectionTheater.tsx`'s `collectionKeyAction()` reproduced from the old
 * `TriageMode.tsx`, now living on `TheaterShell` since triage is folded into
 * the one shell. `ArrowUp` = Back is new (the old map deliberately left it
 * unbound — this task adds pure navigation distinct from `U` undo).
 */
import { describe, it, expect } from 'vitest'
import {
  triageKeyAction,
  shouldCommitDelete,
  shouldDismissUndo,
  triageAdvance,
  triageStepBackIndex,
  type TriageUndoAction,
} from '@/components/theater/TheaterShell'

describe('triageKeyAction', () => {
  it('reproduces the old CollectionTheater/TriageMode key -> action map', () => {
    expect(triageKeyAction({ key: 'ArrowRight' })).toBe('done')
    expect(triageKeyAction({ key: 'ArrowLeft' })).toBe('later')
    expect(triageKeyAction({ key: 'ArrowDown' })).toBe('delete')
    expect(triageKeyAction({ key: 'Backspace' })).toBe('delete')
    expect(triageKeyAction({ key: 'Delete' })).toBe('delete')
    expect(triageKeyAction({ key: 'u' })).toBe('undo')
    expect(triageKeyAction({ key: 'U' })).toBe('undo')
    expect(triageKeyAction({ key: 'Escape' })).toBe('close')
  })

  it('adds ArrowUp as pure "back" navigation (new in the unified shell)', () => {
    expect(triageKeyAction({ key: 'ArrowUp' })).toBe('back')
  })

  it('ignores unmapped keys', () => {
    expect(triageKeyAction({ key: 'q' })).toBe(null)
    expect(triageKeyAction({ key: 'Enter' })).toBe(null)
  })

  it('ignores keys with a modifier held', () => {
    expect(triageKeyAction({ key: 'ArrowRight', metaKey: true })).toBe(null)
    expect(triageKeyAction({ key: 'ArrowLeft', ctrlKey: true })).toBe(null)
    expect(triageKeyAction({ key: 'u', altKey: true })).toBe(null)
  })

  it('ignores keys typed into an input, textarea, or contentEditable element', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })

    expect(triageKeyAction({ key: 'ArrowRight', target: input })).toBe(null)
    expect(triageKeyAction({ key: 'ArrowRight', target: textarea })).toBe(null)
    expect(triageKeyAction({ key: 'u', target: editable })).toBe(null)
  })

  it('still acts on a non-typing target', () => {
    const div = document.createElement('div')
    expect(triageKeyAction({ key: 'ArrowRight', target: div })).toBe('done')
  })
})

function feedItem(id: string) {
  return { id, platform: 'twitter' } as unknown as import('@/components/feed/types').FeedItem
}

describe('shouldCommitDelete', () => {
  it('is true only for a pending "delete" undo', () => {
    const del: TriageUndoAction = { type: 'delete', item: feedItem('1'), index: 0 }
    const archive: TriageUndoAction = { type: 'archive', item: feedItem('1'), index: 0 }
    const keep: TriageUndoAction = { type: 'keep', item: feedItem('1'), index: 0 }
    expect(shouldCommitDelete(del)).toBe(true)
    expect(shouldCommitDelete(archive)).toBe(false)
    expect(shouldCommitDelete(keep)).toBe(false)
    expect(shouldCommitDelete(null)).toBe(false)
  })
})

describe('shouldDismissUndo', () => {
  it('dismisses when the timer is still the current undo (identity match)', () => {
    const action: TriageUndoAction = { type: 'archive', item: feedItem('1'), index: 0 }
    expect(shouldDismissUndo(action, action)).toBe(true)
  })

  it('does NOT dismiss a stale timer once a newer action has replaced it', () => {
    const stale: TriageUndoAction = { type: 'archive', item: feedItem('1'), index: 0 }
    const fresh: TriageUndoAction = { type: 'keep', item: feedItem('2'), index: 1 }
    expect(shouldDismissUndo(fresh, stale)).toBe(false)
  })

  it('does not dismiss when the toast has already been cleared (null)', () => {
    const stale: TriageUndoAction = { type: 'archive', item: feedItem('1'), index: 0 }
    expect(shouldDismissUndo(null, stale)).toBe(false)
  })

  it('treats two value-equal but distinct actions as different (identity, not deep equality)', () => {
    const a: TriageUndoAction = { type: 'keep', item: feedItem('1'), index: 0 }
    const b: TriageUndoAction = { type: 'keep', item: feedItem('1'), index: 0 }
    expect(shouldDismissUndo(b, a)).toBe(false)
  })
})

describe('triageAdvance / triageStepBackIndex', () => {
  it('advance always steps forward one, regardless of which action fired', () => {
    expect(triageAdvance(0)).toBe(1)
    expect(triageAdvance(4)).toBe(5)
  })

  it('back steps to the previous item but never below 0', () => {
    expect(triageStepBackIndex(3)).toBe(2)
    expect(triageStepBackIndex(0)).toBe(0)
  })
})
