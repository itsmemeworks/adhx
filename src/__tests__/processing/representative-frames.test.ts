import { describe, expect, it } from 'vitest'
import { representativeFrames } from '../../../scripts/experiments/representative-frames'

describe('experimental representative frames', () => {
  it('retains beginning, ending and bounded temporal coverage on a static video', () => {
    const selected = representativeFrames(
      Array.from({ length: 15 }, () => Uint8Array.of(100, 100, 100)),
    )
    expect(selected).toEqual([0, 3, 6, 9, 12, 14])
    expect(selected.slice(1).every((value, i) => value - selected[i] <= 3)).toBe(true)
  })
  it('retains a brief final scene and every substantially changing frame', () => {
    const frames = Array.from({ length: 15 }, (_, i) => Uint8Array.of(i * 15, 255 - i * 15, 0))
    expect(representativeFrames(frames)).toHaveLength(15)
    const still = Array.from({ length: 15 }, () => Uint8Array.of(100))
    still[14] = Uint8Array.of(255)
    expect(representativeFrames(still).at(-1)).toBe(14)
  })
  it('rejects invalid signatures instead of silently discarding coverage', () => {
    expect(() => representativeFrames([Uint8Array.of(1), Uint8Array.of(1, 2)])).toThrow()
    expect(() => representativeFrames([Uint8Array.of(1)], 0)).toThrow()
  })
})
