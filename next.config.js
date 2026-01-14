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
}

export default nextConfig
