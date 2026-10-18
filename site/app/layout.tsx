import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Hanken_Grotesk, Instrument_Serif } from 'next/font/google'
import './globals.css'

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
})
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-hanken-grotesk',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://adhx.com'),
  title: 'ADHX: keep every post you love, on your own server',
  description:
    'Self-hosted and open source. Save posts from X, Instagram, TikTok, YouTube, Reddit and nine more networks, keep the originals in full quality, and find anything by describing it. With iPhone and Android companion apps.',
  icons: {
    icon: [
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'ADHX: keep every post you love, on your own server',
    description:
      'Self-hosted and open source. Fourteen networks, full-quality originals, search by meaning.',
    images: [{ url: '/adhx-reel.jpg', width: 1280, height: 720 }],
    videos: [{ url: '/adhx-reel.mp4', width: 1280, height: 720, type: 'video/mp4' }],
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
