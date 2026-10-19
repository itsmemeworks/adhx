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
  title: 'ADHX: your friends have better taste than the algorithm',
  description:
    'A private feed of the best of fourteen social networks, picked by your closest friends and family, on a server you run. New shows only what you haven’t seen, with your friends’ faces on every save, then stops. Channels from everyone’s saves, Live watch-together, search by what’s said and what’s on screen, and invite links that pair a phone. Open source, with iPhone and Android apps.',
  icons: {
    icon: [
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'ADHX: your friends have better taste than the algorithm',
    description:
      'A private feed picked by your people, not an algorithm. New, then caught up. Saver faces, channels, Live and search by what’s said. Self-hosted and open source.',
    images: [{ url: '/adhx-reel.jpg', width: 1280, height: 720 }],
    videos: [{ url: '/adhx-reel.mp4', width: 1280, height: 720, type: 'video/mp4' }],
  },
}

export const viewport: Viewport = { themeColor: '#000000' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <head>
        {/* Meme captions: Impact where installed, else Anton (globals.css, --font-meme). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
