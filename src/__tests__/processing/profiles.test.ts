import { describe, expect, it } from 'vitest'
import {
  createVideoPlan,
  INDEXING_LEVELS,
  MAX_SEGMENT_FRAMES,
  MAX_VIDEO_DURATION,
  MAX_VIDEO_SEGMENTS,
  segmentBounds,
  segmentSampleTimes,
  validateVideoPlan,
} from '@/lib/processing/profiles'

describe('elastic full-video indexing profiles', () => {
  it('increases temporal detail with the requested understanding level', () => {
    const plans = INDEXING_LEVELS.map((level) => createVideoPlan(600, level))
    expect(plans.map((p) => p.segments)).toEqual([5, 10, 20])
    expect(plans.map((p) => p.framesPerSegment)).toEqual([10, 15, 15])
    expect(plans.map((p) => p.segments * p.framesPerSegment)).toEqual([50, 150, 300])
  })

  it.each(INDEXING_LEVELS)(
    '%s covers the complete duration with bounded inference windows',
    (level) => {
      for (const duration of [0.1, 1, 31, 32, 61, 125, 601.5, 7200, MAX_VIDEO_DURATION]) {
        const plan = createVideoPlan(duration, level)
        expect(plan.segments).toBeLessThanOrEqual(MAX_VIDEO_SEGMENTS)
        expect(plan.framesPerSegment).toBeLessThanOrEqual(MAX_SEGMENT_FRAMES)
        let end = 0
        for (let index = 0; index < plan.segments; index++) {
          const bounds = segmentBounds(plan, index)
          expect(bounds.start).toBe(end)
          const times = segmentSampleTimes(plan, index)
          expect(times).toHaveLength(plan.framesPerSegment)
          expect(times[0]).toBeGreaterThan(bounds.start)
          expect(times.at(-1)).toBeLessThan(bounds.end)
          expect(times).toEqual([...times].sort((a, b) => a - b))
          end = bounds.end
        }
        expect(end).toBe(duration)
      }
    },
  )

  it('uses a single centered frame for a very short video', () => {
    const plan = createVideoPlan(0.5, 'deep')
    expect(plan.segments).toBe(1)
    expect(segmentSampleTimes(plan, 0)).toEqual([0.25])
  })

  it('widens spacing safely for very long videos rather than truncating their ending', () => {
    const plan = createVideoPlan(MAX_VIDEO_DURATION, 'deep')
    expect(plan.segments).toBe(512)
    expect(plan.framesPerSegment).toBe(16)
    expect(segmentBounds(plan, 511).end).toBe(MAX_VIDEO_DURATION)
    expect(segmentSampleTimes(plan, 511).at(-1)).toBeGreaterThan(MAX_VIDEO_DURATION - 12)
  })

  it.each([0, -1, NaN, Infinity, MAX_VIDEO_DURATION + 1])(
    'rejects invalid duration %s',
    (duration) => {
      expect(() => createVideoPlan(duration, 'normal')).toThrow()
    },
  )

  it('rejects malformed server plans and segment indexes before allocating frames', () => {
    const plan = createVideoPlan(90, 'normal')
    expect(() => validateVideoPlan({ ...plan, framesPerSegment: 10000 })).toThrow()
    expect(() => validateVideoPlan({ ...plan, segments: 0 })).toThrow()
    for (const index of [-1, 0.5, NaN, plan.segments]) {
      expect(() => segmentSampleTimes(plan, index)).toThrow()
    }
  })
})
