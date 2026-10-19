import type { Metadata, Viewport } from 'next'
import {
  IBM_Plex_Sans,
  Inter,
  Lexend,
  Atkinson_Hyperlegible,
  Indie_Flower,
  Newsreader,
  Roboto_Mono,
  Instrument_Serif,
} from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import { getCurrentUserId } from '@/lib/auth/session'

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

// The look's faces: Instrument Serif (display) and Hanken Grotesk (body).
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  preload: false,
})

// Hanken Grotesk ships with the app (variable, 400–800, Latin; OFL licence
// beside it). Google's copy broke `next build` inside Docker, and a NAS build
// shouldn't need Google Fonts for the body face.
const hankenGrotesk = localFont({
  src: './fonts/HankenGrotesk-latin-variable.woff2',
  weight: '400 800',
  variable: '--font-hanken-grotesk',
  display: 'swap',
  preload: false,
})

const siteUrl = PUBLIC_BASE_URL
const siteDescription =
  'Keep posts from X, Instagram, TikTok, YouTube, Reddit and more on your own server, then find them by describing what you remember.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ADHX - Save it. Lose it. Find it.',
    template: '%s | ADHX',
  },
  description: siteDescription,
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
    'what people are sending',
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
    title: 'ADHX - Save it. Lose it. Find it.',
    description: siteDescription,
    // Images auto-generated from opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ADHX - Save it. Lose it. Find it.',
    description: siteDescription,
    // Images auto-generated from twitter-image.tsx
    creator: '@adhx_app',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/icon-192.png',
  },
  manifest: '/manifest.json',
  category: 'productivity',
}

export const viewport: Viewport = {
  themeColor: '#08070a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

// JSON-LD structured data for SEO
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ADHX',
  applicationCategory: 'ProductivityApplication',
  operatingSystem: 'Web',
  description:
    'Save posts from X, Instagram, TikTok, YouTube and ten more networks, with their videos and photos kept on your own server, and find any of them by describing what you remember.',
  url: PUBLIC_BASE_URL,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'Save posts from 14 networks, with their media kept in the best quality',
    'Sync X bookmarks every hour',
    'Find posts by describing what you remember',
    'See what your friends are saving right now',
    'Share from your phone with the ADHX Share app',
  ],
}

// Sitewide WebSite schema (distinct from the SoftwareApplication block above).
// No SearchAction: in-app search is authed-only, so a fake search URL here
// would be worse than omitting the property.
const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ADHX',
  url: PUBLIC_BASE_URL,
  publisher: {
    '@type': 'Organization',
    name: 'ADHX',
    logo: `${PUBLIC_BASE_URL}/logo-paper.png`,
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // This immutable, ban-aware server identity binds the RSC payload to the
  // account that was authorized to render it. AppShell does not trust a
  // refreshed payload until /api/auth/me settles to this exact same ID.
  const serverAccountId = await getCurrentUserId()
  // Browser translation stays ENABLED on purpose (owner decision): reading a
  // Spanish tweet in English is a feature, not a hazard to be switched off.
  // What it costs us is that Chrome/Safari replace the text nodes React owns
  // with their own <font> wrappers, so React must never keep a bare text node
  // as the SIBLING of an element — see the note in TheaterLinkedText and
  // `docs/specs/translation-safety.md`.
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(websiteJsonLd) }}
        />
      </head>
      <body
        className={`${ibmPlex.variable} ${inter.variable} ${lexend.variable} ${atkinson.variable} ${indieFlower.variable} ${newsreader.variable} ${robotoMono.variable} ${instrumentSerif.variable} ${hankenGrotesk.variable}`}
      >
        <AppShell serverAccountId={serverAccountId}>{children}</AppShell>
      </body>
    </html>
  )
}
