/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  IosHow,
  IosShortcutInstallButton,
  IosShortcutNudge,
  IosShortcutSettingsCard,
  SHORTCUT_DISMISS_KEY,
} from '@/components/IosShortcutInstall'
import { IOS_SHORTCUT_URL } from '@/lib/share/ios'

let mockIos = true
vi.mock('@/lib/platform', () => ({
  isIOSDevice: () => mockIos,
  getPlatformType: () => (mockIos ? 'ios' : 'desktop'),
}))

beforeEach(() => {
  mockIos = true
  localStorage.clear()
})

describe('IosShortcutInstallButton', () => {
  it('opens the iCloud shortcut as a one-tap install', () => {
    render(<IosShortcutInstallButton />)
    const link = screen.getByRole('link', { name: /add to share sheet/i })
    expect(link).toHaveAttribute('href', IOS_SHORTCUT_URL)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('outline is a clay border, not a filled clay button', () => {
    render(<IosShortcutInstallButton variant="outline">Add shortcut</IosShortcutInstallButton>)
    const link = screen.getByRole('link', { name: /add shortcut/i })
    expect(link.className).toContain('border-clay')
    expect(link.className).not.toContain('bg-clay-grad')
  })
})

describe('IosShortcutSettingsCard', () => {
  it('shows the iCloud shortcut on iOS', () => {
    render(<IosShortcutSettingsCard />)
    expect(screen.getByText('Add to the iOS share menu')).toBeInTheDocument()
    expect(
      screen.getByText('Then from X, Instagram, TikTok, or YouTube: Share → ADHX.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add to share sheet/i })).toHaveAttribute(
      'href',
      IOS_SHORTCUT_URL,
    )
    expect(screen.getByText('Add shortcut')).toBeInTheDocument()
    expect(screen.getByText('Share → ADHX')).toBeInTheDocument()
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

describe('IosShortcutNudge', () => {
  it('shows the install on iOS until dismissed', () => {
    render(<IosShortcutNudge />)
    expect(screen.getByText('Next time, skip this page')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add to share sheet/i })).toHaveAttribute(
      'href',
      IOS_SHORTCUT_URL,
    )

    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('Next time, skip this page')).not.toBeInTheDocument()
    expect(localStorage.getItem(SHORTCUT_DISMISS_KEY)).toBe('1')
  })

  it('stays hidden on non-iOS', () => {
    mockIos = false
    const { container } = render(<IosShortcutNudge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden once dismissed', () => {
    localStorage.setItem(SHORTCUT_DISMISS_KEY, '1')
    const { container } = render(<IosShortcutNudge />)
    expect(container).toBeEmptyDOMElement()
  })
})
