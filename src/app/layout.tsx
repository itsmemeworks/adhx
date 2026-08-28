import type { Metadata, Viewport } from 'next'
import {
  IBM_Plex_Sans,
  Inter,
  Lexend,
  Atkinson_Hyperlegible,
  Indie_Flower,
  Newsreader,
  Roboto_Mono,
} from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/lib/theme/context'
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

const siteUrl = PUBLIC_BASE_URL
const siteDescription =
  'Stop saying "wait, I had the perfect meme for this." Save your favorites, build shareable playlists, and become the meme lord your group chat deserves.'

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e4dac8' },
    { media: '(prefers-color-scheme: dark)', color: '#08070a' },
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
  description:
    "Sync your X/Twitter bookmarks into one searchable home, discover what's trending, and work through your backlog — every tweet, thread, Reel, TikTok and YouTube Short in one place. The ADHD-friendly bookmark manager.",
  url: 'https://adhx.com',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  featureList: [
    'Sync hundreds of X/Twitter bookmarks',
    'Discover what people are watching and sending in real time',
    'Full-text search across everything you save',
    'One post at a time — archive what you are done with',
    'Text-to-speech for any post or article',
    'Save Reels, TikToks and Shorts alongside tweets',
    'Bionic reading and reader-friendly fonts',
  ],
}

// Sitewide WebSite schema (distinct from the SoftwareApplication block above).
// No SearchAction: in-app search is authed-only, so a fake search URL here
// would be worse than omitting the property.
const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ADHX',
  url: 'https://adhx.com',
  publisher: {
    '@type': 'Organization',
    name: 'ADHX',
    logo: 'https://adhx.com/logo-paper.png',
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
                  if (theme === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  } else if (!theme) {
                    // No stored preference: theater-dark routes default to dark
                    // (theater-first.md §7) — the home theater ('/'), the dark
                    // ranked-list Browse view ('/trending', '/trending/<filter>'),
                    // and the four preview-page shapes; everywhere else follows
                    // the device. Mirrors isTheaterDarkRoute()/resolveInitialTheme()
                    // in src/lib/theme/context.tsx (and its preview regexes mirror
                    // isPreviewPage in src/components/AppShell.tsx) — keep all
                    // three in lockstep.
                    var p = location.pathname;
                    var isTheaterDark = p === '/'
                      || p === '/live'
                      || p === '/saved'
                      || p === '/collection'
                      || p === '/trending'
                      || p.indexOf('/trending/') === 0
                      || /^\\/\\w+\\/status\\/\\d+$/.test(p)
                      || /^\\/reels?\\/[A-Za-z0-9_-]+$/.test(p)
                      || /^\\/p\\/[A-Za-z0-9_-]+$/.test(p)
                      || /^\\/shorts\\/[A-Za-z0-9_-]{11}$/.test(p)
                      || /^\\/@?[A-Za-z0-9._]+\\/video\\/\\d+$/.test(p);
                    resolved = isTheaterDark
                      ? 'dark'
                      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  }
                  document.documentElement.classList.add(resolved);
                } catch (e) {}
              })();
            `,
          }}
        />
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
        className={`${ibmPlex.variable} ${inter.variable} ${lexend.variable} ${atkinson.variable} ${indieFlower.variable} ${newsreader.variable} ${robotoMono.variable}`}
      >
        <ThemeProvider>
          <AppShell serverAccountId={serverAccountId}>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
