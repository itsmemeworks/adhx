/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AndroidHow, AndroidSettingsCard, AndroidLandingPromo } from '@/components/AndroidInstall'

let mockPlatform: 'ios' | 'android' | 'desktop' = 'android'
vi.mock('@/lib/platform', () => ({
  getPlatformType: () => mockPlatform,
}))

function setStandalone(value: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: value,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  mockPlatform = 'android'
  setStandalone(false)
})

describe('AndroidHow', () => {
  it('shows three visual steps then Share → ADHX', () => {
    render(<AndroidHow />)
    expect(screen.getByText('Add to Home')).toBeInTheDocument()
    expect(screen.getByText('Open the app')).toBeInTheDocument()
    expect(screen.getByText('Share → ADHX')).toBeInTheDocument()
    expect(screen.getByText(/Paste link still works/)).toBeInTheDocument()
  })
})

describe('AndroidSettingsCard', () => {
  it('uses the same install chrome as the nudge, with steps already open', () => {
    render(<AndroidSettingsCard />)
    expect(screen.getByText('Share a post directly to ADHX')).toBeInTheDocument()
    expect(document.getElementById('android-install')).not.toBeNull()
    expect(screen.getByText('Add to Home')).toBeInTheDocument()
    expect(screen.getByText('Share → ADHX')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'How' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument()
    expect(screen.queryByText('Android install')).not.toBeInTheDocument()
  })

  it('stays hidden on non-Android', () => {
    mockPlatform = 'ios'
    const { container } = render(<AndroidSettingsCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('confirms install when already standalone', () => {
    setStandalone(true)
    render(<AndroidSettingsCard />)
    expect(
      screen.getByText(/Installed. From X, Instagram, TikTok, or YouTube: Share → ADHX/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'How' })).not.toBeInTheDocument()
  })

  it('scrolls the Settings card into view when the hash is #android-install', async () => {
    window.location.hash = '#android-install'
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    render(<AndroidSettingsCard />)
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    window.location.hash = ''
  })

  it('offers Add when beforeinstallprompt fires', async () => {
    render(<AndroidSettingsCard />)
    const evt = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: string }>
    }
    evt.prompt = vi.fn(() => Promise.resolve())
    evt.userChoice = Promise.resolve({ outcome: 'accepted' })
    await act(async () => {
      window.dispatchEvent(evt)
    })
    expect(await screen.findByRole('button', { name: 'Add' })).toBeInTheDocument()
  })
})

describe('AndroidLandingPromo', () => {
  it('leads with Share → ADHX after install', () => {
    render(<AndroidLandingPromo />)
    expect(
      screen.getByText(/Share a post from X, Instagram, TikTok, or YouTube/),
    ).toBeInTheDocument()
    expect(screen.getByText('Add to Home')).toBeInTheDocument()
  })
})
