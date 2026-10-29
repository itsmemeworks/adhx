import type { MetadataRoute } from 'next'
import { appUrl } from '@/lib/routes/app-url'
import { publicPagesOn } from '@/lib/settings/public-pages'

/**
 * /robots.txt, built per request from this ADHX's own address and the
 * owner's "Show up in search engines" switch (Admin → System). Off (the
 * default on a new server), crawlers are turned away from everything and no
 * sitemap is named. Link-preview bots keep the public rules either way, so a
 * post someone sends still unfurls into a card.
 */
export const dynamic = 'force-dynamic'

/**
 * Bots that fetch a page only because someone pasted its link into a chat or
 * a post. They read robots.txt, so turning them away would break sharing.
 */
const LINK_PREVIEW_BOTS = [
  'Twitterbot',
  'facebookexternalhit',
  'Facebot',
  'LinkedInBot',
  'Slackbot-LinkExpanding',
  'Discordbot',
  'TelegramBot',
  'WhatsApp',
]

/**
 * What a crawler may fetch when pages are public. Everything under /api/ is
 * session-gated except the public JSON, social cards and the media behind
 * VideoObject posters and streams (a blanket `Disallow: /api/` once hid
 * those thumbnails from Google).
 */
const PUBLIC_RULES = {
  allow: ['/', '/t/', '/api/share/', '/api/og/', '/api/media/'],
  disallow: ['/api/', '/settings', '/admin', '/dev/', '/tags', '/welcome', '/share'],
}

export default function robots(): MetadataRoute.Robots {
  if (!publicPagesOn()) {
    return {
      rules: [
        { userAgent: LINK_PREVIEW_BOTS, ...PUBLIC_RULES },
        { userAgent: '*', disallow: '/' },
      ],
    }
  }
  return {
    rules: { userAgent: '*', ...PUBLIC_RULES },
    sitemap: `${appUrl()}/sitemap.xml`,
  }
}
