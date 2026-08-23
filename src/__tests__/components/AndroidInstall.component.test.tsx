/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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
  it('lists home-screen then Share → ADHX', () => {
    render(<AndroidHow />)
    expect(screen.getByText(/Add to Home screen/)).toBeInTheDocument()
    expect(screen.getAllByText(/Share → ADHX/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Paste link still works/)).toBeInTheDocument()
  })
})

describe('AndroidSettingsCard', () => {
  it('shows the walkthrough on Android', () => {
    render(<AndroidSettingsCard />)
    expect(screen.getByText('Android install')).toBeInTheDocument()
    expect(document.getElementById('android-install')).not.toBeNull()
    expect(screen.getByText(/Add to Home screen, then Share → ADHX/)).toBeInTheDocument()
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
    expect(screen.queryByText(/Browser menu/)).not.toBeInTheDocument()
  })

  it('offers Add to Home screen when beforeinstallprompt fires', async () => {
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
    expect(await screen.findByRole('button', { name: 'Add to Home screen' })).toBeInTheDocument()
  })
})

describe('AndroidLandingPromo', () => {
  it('leads with Share → ADHX after install', () => {
    render(<AndroidLandingPromo />)
    expect(screen.getByText(/Add ADHX to your home screen once/)).toBeInTheDocument()
    expect(screen.getByText(/Share Target needs the installed app/)).toBeInTheDocument()
  })
})
