/**
 * @vitest-environment jsdom
 *
 * Round 8 (owner request): "Start from the beginning" — a deliberate
 * navigation back to the top of the queue instead of waiting for new sends.
 * `onReplay` is omitted entirely when there's nothing to replay (an empty
 * queue), in which case the button must not render at all.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StageWaiting } from '@/components/theater/StageWaiting'

describe('StageWaiting', () => {
  it('shows the caught-up headline and waiting copy', () => {
    render(<StageWaiting />)
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    expect(screen.getByText('waiting for new sends…')).toBeInTheDocument()
  })

  it('shows the saved-today count only when provided and non-zero', () => {
    render(<StageWaiting savedToday={12} />)
    expect(screen.getByText('12 saved today')).toBeInTheDocument()
  })

  it('omits the saved-today line when zero or absent', () => {
    render(<StageWaiting savedToday={0} />)
    expect(screen.queryByText(/saved today/)).not.toBeInTheDocument()
  })

  it('renders no "Start from the beginning" button when onReplay is omitted', () => {
    render(<StageWaiting />)
    expect(screen.queryByText('Start from the beginning')).not.toBeInTheDocument()
  })

  it('renders and wires the "Start from the beginning" button when onReplay is provided', () => {
    const onReplay = vi.fn()
    render(<StageWaiting onReplay={onReplay} />)
    const button = screen.getByText('Start from the beginning')
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(onReplay).toHaveBeenCalledTimes(1)
  })

  it('clicks Re-watch all and Keep playing from theater hotkey events', () => {
    const onReplay = vi.fn()
    const onKeepPlaying = vi.fn()
    render(<StageWaiting onReplay={onReplay} replayCount={15} onKeepPlaying={onKeepPlaying} />)
    expect(screen.getByText('Re-watch all 15')).toBeInTheDocument()
    fireEvent(window, new Event('theater-replay'))
    fireEvent(window, new Event('theater-keep-playing'))
    expect(onReplay).toHaveBeenCalledTimes(1)
    expect(onKeepPlaying).toHaveBeenCalledTimes(1)
  })
})
