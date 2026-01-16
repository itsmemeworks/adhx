/**
 * Dev API: Extract OG tags from a page
 *
 * Fetches a page and extracts Open Graph meta tags for preview.
 * Only available in development mode.
 */

import { NextRequest, NextResponse } from 'next/server'

interface OgTags {
  title: string | null
  description: string | null
  image: string | null
  imageAlt: string | null
  siteName: string | null
  type: string | null
  twitterCard: string | null
  twitterTitle: string | null
  twitterDescription: string | null
  twitterImage: string | null
  twitterCreator: string | null
}

// Decode common HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x22;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const path = request.nextUrl.searchParams.get('path')
  if (!path) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  try {
    // Fetch the page HTML
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const url = `${baseUrl}${path}`

    const response = await fetch(url, {
      headers: {
        // Pretend to be a social crawler to get full OG tags
        'User-Agent': 'Twitterbot/1.0',
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch page: ${response.status}` }, { status: 500 })
    }

    const html = await response.text()

    // Extract OG tags using regex (simple but effective for meta tags)
    const extractMeta = (property: string): string | null => {
      let value: string | null = null

      // Try property attribute (OG standard)
      const propertyMatch = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'))
      if (propertyMatch) value = propertyMatch[1]

      // Try content before property
      if (!value) {
        const reverseMatch = html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'))
        if (reverseMatch) value = reverseMatch[1]
      }

      // Try name attribute (Twitter cards)
      if (!value) {
        const nameMatch = html.match(new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'))
        if (nameMatch) value = nameMatch[1]
      }

      // Try content before name
      if (!value) {
        const reverseNameMatch = html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`, 'i'))
        if (reverseNameMatch) value = reverseNameMatch[1]
      }

      // Decode HTML entities if we found a value
      return value ? decodeHtmlEntities(value) : null
    }

    // Also extract <title> tag
    const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const titleTag = titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]) : null

    const ogTags: OgTags = {
      title: extractMeta('og:title') || titleTag,
      description: extractMeta('og:description'),
      image: extractMeta('og:image'),
      imageAlt: extractMeta('og:image:alt'),
      siteName: extractMeta('og:site_name'),
      type: extractMeta('og:type'),
      twitterCard: extractMeta('twitter:card'),
      twitterTitle: extractMeta('twitter:title'),
      twitterDescription: extractMeta('twitter:description'),
      twitterImage: extractMeta('twitter:image'),
      twitterCreator: extractMeta('twitter:creator'),
    }

    return NextResponse.json(ogTags)
  } catch (error) {
    console.error('Failed to extract OG tags:', error)
    return NextResponse.json({ error: 'Failed to extract OG tags' }, { status: 500 })
  }
}
