/**
 * Setup file for component tests
 *
 * This file configures the testing environment for React component tests.
 * It's loaded for all tests but only applies DOM matchers when in jsdom environment.
 */
import { afterEach, vi } from 'vitest'

// Only add DOM matchers and cleanup when in browser environment
if (typeof window !== 'undefined') {
  // Import jest-dom matchers for DOM assertions
  import('@testing-library/jest-dom/vitest')

  // Import cleanup to run after each test
  import('@testing-library/react').then(({ cleanup }) => {
    afterEach(() => {
      cleanup()
    })
  })
}

// Mock Next.js navigation (works in both environments)
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// Mock Next.js image component
vi.mock('next/image', () => ({
  default: function MockImage({
    src,
    alt,
    ...props
  }: {
    src: string
    alt: string
    [key: string]: unknown
  }) {
    // Return a simple img element for testing
    return { type: 'img', props: { src, alt, ...props } }
  },
}))

// Mock preferences context with default values
vi.mock('@/lib/preferences-context', () => ({
  usePreferences: () => ({
    preferences: {
      bionicReading: false,
      bodyFont: 'ibm-plex',
    },
    updatePreference: vi.fn(),
    loading: false,
  }),
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
  FONT_OPTIONS: {
    'ibm-plex': {
      name: 'IBM Plex Sans',
      description: 'Clean and professional - the default choice',
    },
    'lexend': {
      name: 'Lexend',
      description: 'Designed specifically for ADHD and reading difficulties',
    },
    'atkinson': {
      name: 'Atkinson Hyperlegible',
      description: 'Maximum legibility - great letter differentiation',
    },
    'inter': {
      name: 'Inter',
      description: 'Neutral and familiar with excellent screen rendering',
    },
  },
}))
