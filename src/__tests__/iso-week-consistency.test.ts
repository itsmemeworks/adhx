import { describe, expect, it } from 'vitest'
import { isoWeekSlug } from '@/lib/sitemap/queries'
import { isoWeekOf, isoWeekSlugOf, parseIsoWeekSlug } from '@/lib/trending/archive'

// The sitemap emits /trending/archive/{week} URLs from its own ISO-week
// implementation (src/lib/sitemap/queries.ts), while the archive route parses
// and serves them with a second, independent implementation
// (src/lib/trending/archive.ts). If the two ever disagree on a single day,
// the sitemap advertises a URL the route 404s. This suite pins the seam.
describe('sitemap ↔ archive ISO week consistency', () => {
  it('produces identical slugs for every day from 2019 through 2027', () => {
    const start = Date.UTC(2019, 0, 1)
    const end = Date.UTC(2027, 11, 31)
    const DAY = 24 * 60 * 60 * 1000
    for (let t = start; t <= end; t += DAY) {
      const date = new Date(t)
      const fromSitemap = isoWeekSlug(date)
      const fromArchive = isoWeekSlugOf(isoWeekOf(date))
      expect(fromArchive, `disagreement on ${date.toISOString()}`).toBe(fromSitemap)
    }
  })

  it('archive parses every slug the sitemap can emit (round-trip)', () => {
    const start = Date.UTC(2019, 0, 1)
    const end = Date.UTC(2027, 11, 31)
    const DAY = 24 * 60 * 60 * 1000
    const slugs = new Set<string>()
    for (let t = start; t <= end; t += DAY) {
      slugs.add(isoWeekSlug(new Date(t)))
    }
    for (const slug of slugs) {
      const parsed = parseIsoWeekSlug(slug)
      expect(parsed, `archive rejected sitemap slug ${slug}`).not.toBeNull()
      expect(isoWeekSlugOf(parsed!)).toBe(slug)
    }
  })
})
