/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { collectionKeyAction } from '@/components/theater/CollectionTheater'

/**
 * `collectionKeyAction` vs. the OLD map it must reproduce exactly
 * (`TriageMode.tsx`'s keydown switch, verified against source at the time of
 * writing):
 *
 *   ArrowRight              → archive() ("Done")
 *   ArrowLeft               → keep()    ("Later")
 *   ArrowDown/Backspace/Delete → del()  ("Delete")
 *   u / U                   → doUndo()
 *   Escape                  → onClose()
 *   anything else           → no-op
 *
 * TriageMode only guarded `e.target instanceof HTMLInputElement`; this adds
 * textarea/contentEditable/modifier-key guards on top (spec: "Ignore
 * inputs/textareas/modifiers") without changing what any bare keypress does.
 */
describe('collectionKeyAction', () => {
  it('reproduces the old TriageMode key → action map', () => {
    expect(collectionKeyAction({ key: 'ArrowRight' })).toBe('done')
    expect(collectionKeyAction({ key: 'ArrowLeft' })).toBe('later')
    expect(collectionKeyAction({ key: 'ArrowDown' })).toBe('delete')
    expect(collectionKeyAction({ key: 'Backspace' })).toBe('delete')
    expect(collectionKeyAction({ key: 'Delete' })).toBe('delete')
    expect(collectionKeyAction({ key: 'u' })).toBe('undo')
    expect(collectionKeyAction({ key: 'U' })).toBe('undo')
    expect(collectionKeyAction({ key: 'Escape' })).toBe('close')
  })

  it('does not bind ArrowUp — there is no "prev" action in the Keep/Done/Delete model', () => {
    // The theater convention (↓/↑ = next/prev) does not fit here: ArrowDown is
    // already "Delete" in the preserved map, and every keypress in this model
    // performs an action-and-advance rather than pure navigation. Adding an
    // alias would either collide with Delete or bind a key to nothing.
    expect(collectionKeyAction({ key: 'ArrowUp' })).toBe(null)
  })

  it('ignores unmapped keys', () => {
    expect(collectionKeyAction({ key: 'q' })).toBe(null)
    expect(collectionKeyAction({ key: 'p' })).toBe(null)
    expect(collectionKeyAction({ key: 'r' })).toBe(null)
    expect(collectionKeyAction({ key: 'Enter' })).toBe(null)
  })

  it('ignores keys with a modifier held (Cmd/Ctrl/Alt shortcuts pass through)', () => {
    expect(collectionKeyAction({ key: 'ArrowRight', metaKey: true })).toBe(null)
    expect(collectionKeyAction({ key: 'ArrowLeft', ctrlKey: true })).toBe(null)
    expect(collectionKeyAction({ key: 'u', altKey: true })).toBe(null)
  })

  it('ignores keys typed into an input, textarea, or contentEditable element', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })

    expect(collectionKeyAction({ key: 'ArrowRight', target: input })).toBe(null)
    expect(collectionKeyAction({ key: 'ArrowRight', target: textarea })).toBe(null)
    expect(collectionKeyAction({ key: 'u', target: editable })).toBe(null)
  })

  it('still acts on a non-typing target', () => {
    const div = document.createElement('div')
    expect(collectionKeyAction({ key: 'ArrowRight', target: div })).toBe('done')
  })
})
