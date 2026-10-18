/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IosHow, IosShortcutSettingsCard } from '@/components/IosShortcutInstall'

let mockIos = true
vi.mock('@/lib/platform', () => ({
  getPlatformType: () => (mockIos ? 'ios' : 'desktop'),
}))

beforeEach(() => {
  mockIos = true
})

describe('IosShortcutSettingsCard', () => {
  it('shows how to make a shortcut that points at this server', () => {
    render(<IosShortcutSettingsCard />)
    expect(screen.getByText('Add to the iOS share menu')).toBeInTheDocument()
    expect(screen.getByText(`${window.location.origin}/share?url=`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy the address' })).toBeInTheDocument()
  })

  it('stays hidden on non-iOS', () => {
    mockIos = false
    const { container } = render(<IosShortcutSettingsCard />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('IosHow', () => {
  it('shows three visual steps', () => {
    render(<IosHow />)
    expect(screen.getByText('Add shortcut')).toBeInTheDocument()
    expect(screen.getByText('Open a post')).toBeInTheDocument()
    expect(screen.getByText('Share → ADHX')).toBeInTheDocument()
    expect(screen.queryByText(/Adds ADHX to your iOS share menu/)).not.toBeInTheDocument()
    expect(screen.queryByText(/X today/)).not.toBeInTheDocument()
    expect(screen.queryByText(/instagram, tiktok, youtube too/i)).not.toBeInTheDocument()
  })
})
