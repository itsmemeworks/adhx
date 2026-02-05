import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Expose app version to client
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Enable server-side external packages for better-sqlite3
  serverExternalPackages: ['better-sqlite3'],

  // Image optimization for Twitter media
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'video.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'd.fxtwitter.com',
      },
    ],
  },

  // Security headers for production
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' https://pbs.twimg.com https://d.fxtwitter.com https://d.fixupx.com https://abs.twimg.com data: blob:",
            "media-src 'self' https://video.twimg.com https://*.twimg.com blob:",
            "font-src 'self' data:",
            "connect-src 'self' https://api.fxtwitter.com https://*.sentry.io",
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
  ],
}

export default nextConfig
