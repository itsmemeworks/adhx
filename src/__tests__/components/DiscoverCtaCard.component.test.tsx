/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscoverCtaCard } from '@/components/discover/DiscoverCtaCard'

describe('DiscoverCtaCard', () => {
  it('renders the quiet copy and connect action', () => {
    render(<DiscoverCtaCard onConnect={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText(/Like what you.re seeing/)).toBeInTheDocument()
    expect(screen.getByText(/Connect with X to start your own collection/)).toBeInTheDocument()
    expect(screen.getByText('Connect with')).toBeInTheDocument()
  })

  it('fires onConnect when the connect button is clicked', () => {
    const onConnect = vi.fn()
    render(<DiscoverCtaCard onConnect={onConnect} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByText('Connect with').closest('button')!)
    expect(onConnect).toHaveBeenCalledTimes(1)
  })

  it('fires onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn()
    render(<DiscoverCtaCard onConnect={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
