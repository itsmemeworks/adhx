import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Inter, Lexend, Atkinson_Hyperlegible, Indie_Flower, Newsreader, Roboto_Mono } from 'next/font/google'
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

// Indie Flower - playful handwritten font for the ADHX wordmark only
const indieFlower = Indie_Flower({
  subsets: ['latin'],
  variable: '--font-indie-flower',
  weight: '400',
})

// Matter — Newsreader serif (headlines, page titles, article reading body)
const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
})

// Matter — Roboto Mono (handles, timestamps, counts, URLs)
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-roboto-mono',
})

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://adhx.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ADHX - Save now. Read never. Find always.',
    template: '%s | ADHX',
  },
  description: "Sync your X/Twitter bookmarks into one searchable home, discover what's trending, and triage your backlog — every tweet, thread, Reel, TikTok and YouTube Short in one place. The ADHD-friendly bookmark manager.",
  keywords: [
    'X bookmarks',
    'Twitter bookmarks',
    'bookmark manager',
    'organize Twitter bookmarks',
    'sync X bookmarks',
    'save tweets',
    'read tweets later',
    'trending on X',
    'what people are saving',
    'ADHD productivity',
    'tweet manager',
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
    description: "Sync your X bookmarks, discover what's trending, and triage your backlog — tweets, threads, Reels, TikToks and Shorts in one searchable home.",
    // Images auto-generated from opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ADHX - Save now. Read never. Find always.',
    description: "Sync your X bookmarks, discover what's trending, and triage your backlog — tweets, threads, Reels, TikToks and Shorts in one searchable home.",
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
  description: "Sync your X/Twitter bookmarks into one searchable home, discover what's trending, and triage your backlog — every tweet, thread, Reel, TikTok and YouTube Short in one place. The ADHD-friendly bookmark manager.",
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
    'Sync hundreds of X/Twitter bookmarks',
    'Discover what people are saving in real time',
    'Full-text search across everything you save',
    'One-card-at-a-time triage with streaks',
    'Text-to-speech for any post or article',
    'Save Reels, TikToks and Shorts alongside tweets',
    'Bionic reading and reader-friendly fonts',
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
        {/* Blocking script to prevent theme FOUC - runs before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var resolved = theme;
                  if (theme === 'system' || !theme) {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  document.documentElement.classList.add(resolved);
                } catch (e) {}
              })();
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${ibmPlex.variable} ${inter.variable} ${lexend.variable} ${atkinson.variable} ${indieFlower.variable} ${newsreader.variable} ${robotoMono.variable}`}>
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
