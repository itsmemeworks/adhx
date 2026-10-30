import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Playwright e2e: persist DATABASE_PATH where Next workers can find it even
// when Turbopack drops the env. Owner `pnpm dev` uses `.next` and never
// writes this file.
if (process.env.NEXT_DIST_DIR === '.next-e2e' && process.env.DATABASE_PATH) {
  mkdirSync('.next-e2e', { recursive: true })
  writeFileSync(join('.next-e2e', 'database-path'), process.env.DATABASE_PATH, 'utf8')
}

// In dev, Next/React use eval() for HMR + debugging (callstack reconstruction),
// which a strict CSP blocks — noisy console errors on every page. Allow it for
// `pnpm dev` ONLY. Production stays strict (no 'unsafe-eval'); React never uses
// eval() in production, so the header below is unchanged for real deploys.
const isDev = process.env.NODE_ENV !== 'production'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Expose app version to client
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    // Inlined into the server bundle as `process.env.ADHX_DATABASE_PATH`
    // (dot access only — brackets are not replaced). Playwright-only.
    ...(process.env.NEXT_DIST_DIR === '.next-e2e' && process.env.DATABASE_PATH
      ? { ADHX_DATABASE_PATH: process.env.DATABASE_PATH }
      : {}),
  },

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Playwright e2e runs `next dev` alongside the owner's :3001 server. Next
  // locks on distDir, so the e2e process uses `.next-e2e` (see e2e/env.ts).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Dev-only: Playwright hits localhost / 127.0.0.1. Production ignores this.
  allowedDevOrigins: ['localhost', '127.0.0.1'],

  // Enable server-side external packages for better-sqlite3.
  // @sentry/node is also external: without this, Turbopack bundles a full
  // copy of the SDK into both the server and SSR chunk graphs, producing two
  // independent instances that each wrap http.Server.emit (httpServerIntegration)
  // and recurse into each other — a stack-overflow crash in production.
  serverExternalPackages: [
    'better-sqlite3',
    '@sentry/node',
    'react-email',
    'nodemailer',
    // Understanding pipeline: native ONNX runtime, sharp, and the ffmpeg binary path.
    '@huggingface/transformers',
    'onnxruntime-node',
    'sharp',
  ],

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

  // Retired public pages: their old links (bookmarks, search results,
  // sitemaps) land on what replaced them. Permanent, so search engines move on.
  redirects: async () => [
    { source: '/live', destination: '/now', permanent: true },
    { source: '/discover', destination: '/now', permanent: true },
    { source: '/trending', destination: '/now', permanent: true },
    { source: '/trending/:path*', destination: '/now', permanent: true },
    { source: '/leaderboard', destination: '/channels', permanent: true },
    { source: '/leaderboard/:path*', destination: '/channels', permanent: true },
    { source: '/collections', destination: '/channels', permanent: true },
    { source: '/collections/:path*', destination: '/channels', permanent: true },
  ],

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
          // Other sites never learn which page you were on, and X serves its
          // pictures (it refuses ones asked for with another site's referrer).
          key: 'Referrer-Policy',
          value: 'same-origin',
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
            `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' https: data: blob:",
            "media-src 'self' https://video.twimg.com https://*.twimg.com blob:",
            "font-src 'self' data:",
            "connect-src 'self' https://api.fxtwitter.com https://*.sentry.io",
            // Instagram Reel fallback (official embed).
            'frame-src https://www.instagram.com',
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
    {
      // Invite pages (not /invite/done or /invite/waiting): script-free, token kept off referrers.
      // Keep in step with scriptFreePage's own CSP (src/lib/auth/link-page.ts): this one wins.
      source: '/invite/:token((?!(?:done|waiting)$)[^/]+)',
      headers: [
        { key: 'Referrer-Policy', value: 'same-origin' },
        {
          key: 'Content-Security-Policy',
          value:
            "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        },
      ],
    },
    {
      source: '/api/auth/email/callback',
      headers: [
        // Next's global headers can override Route Handler headers. Keep the
        // token off cross-origin referrers while preserving the form's Origin.
        { key: 'Referrer-Policy', value: 'same-origin' },
        {
          key: 'Content-Security-Policy',
          value:
            "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        },
      ],
    },
  ],
}

export default nextConfig
