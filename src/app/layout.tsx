import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Inter, Lexend, Atkinson_Hyperlegible, Indie_Flower } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/lib/theme/context'
import { PreferencesProvider } from '@/lib/preferences-context'
import { AppShell } from '@/components/AppShell'
import { FontProvider } from '@/components/FontProvider'

// Body fonts - user can choose in settings
const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-lexend',
})

const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-atkinson',
})

// Indie Flower - playful handwritten font for the ADHX brand
const indieFlower = Indie_Flower({
  subsets: ['latin'],
  variable: '--font-indie-flower',
  weight: '400',
})

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://adhx.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ADHX - Save now. Read never. Find always.',
    template: '%s | ADHX',
  },
  description: 'For people who bookmark everything and read nothing. The ADHD-friendly X/Twitter bookmark manager that syncs, organizes, and actually helps you find that tweet you saved 6 months ago.',
  keywords: [
    'Twitter bookmarks',
    'X bookmarks',
    'bookmark manager',
    'ADHD productivity',
    'Twitter organization',
    'save tweets',
    'tweet manager',
    'bookmark sync',
    'Twitter tools',
    'social media organizer',
  ],
  authors: [{ name: 'ADHX' }],
  creator: 'ADHX',
  publisher: 'ADHX',
  applicationName: 'ADHX',
  generator: 'Next.js',
  referrer: 'origin-when-cross-origin',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'ADHX',
    title: 'ADHX - Save now. Read never. Find always.',
    description: 'For people who bookmark everything and read nothing. The ADHD-friendly X/Twitter bookmark manager.',
    // Images auto-generated from opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ADHX - Save now. Read never. Find always.',
    description: 'For people who bookmark everything and read nothing. The ADHD-friendly X/Twitter bookmark manager.',
    // Images auto-generated from twitter-image.tsx
    creator: '@adhx_app',
  },
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.json',
  category: 'productivity',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ADHX',
  applicationCategory: 'ProductivityApplication',
  operatingSystem: 'Web',
  description: 'For people who bookmark everything and read nothing. The ADHD-friendly X/Twitter bookmark manager that syncs, organizes, and actually helps you find that tweet you saved 6 months ago.',
  url: 'https://adhx.com',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '5',
    ratingCount: '1',
  },
  featureList: [
    'Sync up to 800 X/Twitter bookmarks',
    'Full-text search across all saved tweets',
    'Smart categorization with AI',
    'Custom tags and organization',
    'Media-first gallery view',
    'Keyboard shortcuts for power users',
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${ibmPlex.variable} ${inter.variable} ${lexend.variable} ${atkinson.variable} ${indieFlower.variable}`}>
        <ThemeProvider>
          <PreferencesProvider>
            <FontProvider>
              <AppShell>{children}</AppShell>
            </FontProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
