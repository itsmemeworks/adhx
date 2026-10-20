import type { FeedItemResponse as FeedItem } from './build-item'

/**
 * A post's cover picture as an address the apps and the web can load: a path
 * from this ADHX's root (kept files and media proxies, built by the feed's
 * `keptSrc` rules), or a full URL for a link's preview picture.
 */

/** An address the app can resolve against its ADHX: a path from the root, or a full URL. */
export function absolutePath(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return `/${url}`
}

/** A post's cover picture: a link's preview image, a video's poster, a photo. */
export function coverImage(post: FeedItem): string | null {
  const article = post.category === 'article' || post.isXArticle
  const media = post.media?.[0]
  const src = (article ? post.articlePreview?.imageUrl : null) || media?.thumbnailUrl || media?.url
  return src ? absolutePath(src) : null
}
