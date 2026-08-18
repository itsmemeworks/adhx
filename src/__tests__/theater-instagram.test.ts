import { describe, it, expect } from 'vitest'
import { instagramStagePhase } from '@/components/theater/StageInstagram'

/**
 * Pure probe-status → render-phase mapping for the Instagram stage (spec
 * §6/§11): never a black void while probing (spinner, then a quiet status
 * line, capped at 3s), the probe-gated `<video>` once ready, and the
 * official embed on a persistent miss.
 */
describe('instagramStagePhase', () => {
  it('shows the spinner while probing and not yet slow', () => {
    expect(instagramStagePhase('probing', false)).toBe('spinner')
  })

  it('switches to the quiet status line once probing has taken a while', () => {
    expect(instagramStagePhase('probing', true)).toBe('status')
  })

  it('renders the video once the probe confirms the mirror', () => {
    expect(instagramStagePhase('ready', false)).toBe('video')
    expect(instagramStagePhase('ready', true)).toBe('video')
  })

  it('falls back to the official embed on a persistent miss', () => {
    expect(instagramStagePhase('failed', false)).toBe('embed')
    expect(instagramStagePhase('failed', true)).toBe('embed')
  })
})
