/**
 * Canonical public base URL for building absolute links (canonical tags, OG
 * images, JSON-LD `url`/`contentUrl` fields, sitemap entries). Falls back to
 * the production domain — NOT localhost — so a missing `NEXT_PUBLIC_APP_URL`
 * in any deployed environment still produces a valid, indexable absolute URL
 * instead of a dead `http://localhost:3000` link baked into crawled HTML.
 */
export const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adhx.com'
