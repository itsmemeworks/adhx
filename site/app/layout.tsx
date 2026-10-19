import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import './globals.css'

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

export const metadata: Metadata = {
  metadataBase: new URL('https://adhx.com'),
  title: 'ADHX: keep every post you love, on your own server',
  description:
    'Self-hosted and open source. Save posts from X, Instagram, TikTok, YouTube, Reddit and nine more networks, keep copies at the best available resolution, and find them by describing what you remember. With iPhone and Android companion apps.',
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
      'Self-hosted and open source. Fourteen networks, copies at the best available resolution, search by meaning.',
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
