/** Bounded inference windows cover the complete video, including its ending. */
export const INDEXING_LEVELS = ['light', 'normal', 'deep'] as const
export type IndexingLevel = (typeof INDEXING_LEVELS)[number]
export const VIDEO_PLAN_VERSION = 'elastic-v1'
export const MAX_VIDEO_DURATION = 24 * 60 * 60
export const MAX_VIDEO_SEGMENTS = 512
export const MAX_SEGMENT_FRAMES = 16

export interface VideoPlan {
  duration: number
  segments: number
  framesPerSegment: number
  level: IndexingLevel
}

const PROFILES = {
  light: { seconds: 120, frameSeconds: 12 },
  normal: { seconds: 60, frameSeconds: 4 },
  deep: { seconds: 30, frameSeconds: 2 },
} as const

export function isIndexingLevel(value: unknown): value is IndexingLevel {
  return INDEXING_LEVELS.includes(value as IndexingLevel)
}

export function createVideoPlan(duration: number, level: IndexingLevel): VideoPlan {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_VIDEO_DURATION) {
    throw new Error('Video duration must be positive and at most 24 hours')
  }
  if (!isIndexingLevel(level)) throw new Error('Unknown indexing level')
  const profile = PROFILES[level]
  const segments = Math.min(MAX_VIDEO_SEGMENTS, Math.ceil(duration / profile.seconds))
  const span = duration / segments
  return {
    duration,
    segments,
    framesPerSegment: Math.min(
      MAX_SEGMENT_FRAMES,
      Math.max(1, Math.ceil(span / profile.frameSeconds)),
    ),
    level,
  }
}

export function validateVideoPlan(value: VideoPlan): void {
  const expected = createVideoPlan(value.duration, value.level)
  if (
    value.segments !== expected.segments ||
    value.framesPerSegment !== expected.framesPerSegment
  ) {
    throw new Error('Video plan does not match its indexing profile')
  }
}

export function segmentBounds(plan: VideoPlan, index: number): { start: number; end: number } {
  validateVideoPlan(plan)
  if (!Number.isInteger(index) || index < 0 || index >= plan.segments) {
    throw new Error('Invalid video segment index')
  }
  return {
    start: (plan.duration * index) / plan.segments,
    end: (plan.duration * (index + 1)) / plan.segments,
  }
}

/** Sample cell midpoints, avoiding EOF and distributing samples over every window. */
export function segmentSampleTimes(plan: VideoPlan, index: number): number[] {
  const { start, end } = segmentBounds(plan, index)
  return Array.from(
    { length: plan.framesPerSegment },
    (_, frame) => start + ((frame + 0.5) * (end - start)) / plan.framesPerSegment,
  )
}
