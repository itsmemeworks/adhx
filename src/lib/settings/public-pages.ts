import type { Metadata } from 'next'
import { extra } from './extras'

/**
 * May search engines list this ADHX? Off unless the owner turns it on in
 * Admin → System (`PUBLIC_PAGES`). Off, robots.txt turns crawlers away, the
 * sitemap is empty and every page says noindex; shared links still open, and
 * link-preview bots may still fetch them so a sent link shows its card.
 *
 * A server that had public channels before this switch existed was set to On
 * by the startup migration, so upgrading never quietly de-indexes it.
 */
export function publicPagesOn(): boolean {
  return extra('PUBLIC_PAGES')?.toLowerCase() === 'on'
}

/**
 * The site-wide robots meta, set by the root layout. Pages only ever narrow
 * it (`index: false`), never widen it, so this is the one place that decides.
 */
export function siteRobots(): Metadata['robots'] {
  if (!publicPagesOn()) {
    return { index: false, follow: false, googleBot: { index: false, follow: false } }
  }
  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  }
}
