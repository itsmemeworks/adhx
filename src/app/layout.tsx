import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { DemoBar } from '@/components/next/demo/DemoBar'
import { demoMode } from '@/lib/demo/mode'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import { getCurrentUserId } from '@/lib/auth/session'

// Body fonts remain selectable in settings. Every face is bundled so Docker
// builds never depend on Google's changing CSS/font responses. Provenance and
// unchanged OFL licenses live alongside the font files.
const ibmPlex = localFont({
  src: './fonts/IBMPlexSans-variable.ttf',
  weight: '400 700',
  variable: '--font-ibm-plex',
  display: 'swap',
})

const inter = localFont({
  src: './fonts/Inter-variable.ttf',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
})

const lexend = localFont({
  src: './fonts/Lexend-variable.ttf',
  weight: '100 900',
  variable: '--font-lexend',
  display: 'swap',
})

const atkinson = localFont({
  src: [
    { path: './fonts/AtkinsonHyperlegible-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/AtkinsonHyperlegible-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-atkinson',
  display: 'swap',
})

// Indie Flower - playful handwritten font for the ADHX wordmark only
const indieFlower = localFont({
  src: './fonts/IndieFlower-Regular.ttf',
  variable: '--font-indie-flower',
  weight: '400',
  display: 'swap',
})

// Matter — Newsreader serif (headlines, page titles, article reading body)
const newsreader = localFont({
  src: [
    { path: './fonts/Newsreader-variable.ttf', weight: '200 800', style: 'normal' },
    { path: './fonts/Newsreader-Italic-variable.ttf', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
})

// Matter — Roboto Mono (handles, timestamps, counts, URLs)
const robotoMono = localFont({
  src: './fonts/RobotoMono-variable.ttf',
  weight: '400 600',
  variable: '--font-roboto-mono',
  display: 'swap',
})

// The look's faces: Instrument Serif (display) and Hanken Grotesk (body).
const instrumentSerif = localFont({
  src: [
    { path: './fonts/InstrumentSerif-Regular.ttf', style: 'normal' },
    { path: './fonts/InstrumentSerif-Italic.ttf', style: 'italic' },
  ],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
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
  'Every app wants your attention. ADHX just wants your friends’ opinions. Keep the best posts from X, Instagram, TikTok, YouTube, Reddit and more on a server you run, and find any of them by describing what you remember.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ADHX - Your friends have better taste than the algorithm.',
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
    title: 'ADHX - Your friends have better taste than the algorithm.',
    description: siteDescription,
    // Images auto-generated from opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ADHX - Your friends have better taste than the algorithm.',
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
  themeColor: '#0f0e0c',
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
        {demoMode() && <DemoBar />}
      </body>
    </html>
  )
}
