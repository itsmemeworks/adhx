import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import './globals.css'
import { GITHUB_URL, SITE_URL } from '../components/links'
import { OG_IMAGE, TAGLINE } from '../components/seo'

// Reuse the application's licensed assets without a build-time font request.
const serif = localFont({
  src: '../../src/app/fonts/InstrumentSerif-Regular.ttf',
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
})
const sans = localFont({
  src: '../../src/app/fonts/HankenGrotesk-latin-variable.woff2',
  weight: '400 800',
  variable: '--font-hanken-grotesk',
  display: 'swap',
})

const TITLE = 'ADHX: the private social network for you and your friends'
const DESCRIPTION =
  'Your friends pick the best of TikTok, Instagram, X, YouTube and ten more networks, and ADHX plays it in one private feed. Self-hosted, open source, with free AI search.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · ADHX' },
  description: DESCRIPTION,
  applicationName: 'ADHX',
  keywords: [
    'private social network',
    'self-hosted social network',
    'social network for friends',
    'friends only feed',
    'save TikTok videos',
    'save Instagram reels',
    'save X posts',
    'open source',
    'Docker',
  ],
  authors: [{ name: 'ADHX contributors', url: GITHUB_URL }],
  creator: 'ADHX contributors',
  category: 'Social networking',
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/icon-192.png',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'ADHX',
    locale: 'en_GB',
    title: `ADHX: ${TAGLINE.toLowerCase()}`,
    description:
      'A private social network for you and your friends. They find the best of fourteen networks; you all watch it in one feed, on a server you run. Try the demo.',
    images: [OG_IMAGE],
    videos: [{ url: `${SITE_URL}/adhx-reel.mp4`, width: 1280, height: 720, type: 'video/mp4' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `ADHX: ${TAGLINE.toLowerCase()}`,
    description:
      'A private social network for you and your friends. Self-hosted, open source, with free AI search.',
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-video-preview': -1,
      'max-snippet': -1,
    },
  },
}

export const viewport: Viewport = { themeColor: '#000000' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
