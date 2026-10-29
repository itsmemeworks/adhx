import type { MetadataRoute } from 'next'
import { SITE_URL } from '../components/links'

export const dynamic = 'force-static'

/** Everyone, AI crawlers included, may read the whole site. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/showreel/', '/og/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
