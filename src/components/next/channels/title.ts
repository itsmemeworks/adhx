/**
 * A channel's display name: its tag with spaces, first letter up ("dev-tools" → "Dev tools").
 * Plain module (no 'use client') so server pages can call it too.
 */
export function channelTitle(tag: string): string {
  const words = tag.replace(/-+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : tag
}
