import { describe, it, expect } from 'vitest'
import { asContentType, inferContentType } from '@/lib/content-type'

describe('asContentType', () => {
  it('keeps known types and drops anything else', () => {
    expect(asContentType('article')).toBe('article')
    expect(asContentType('video')).toBe('video')
    expect(asContentType('quote')).toBeUndefined()
    expect(asContentType('nope')).toBeUndefined()
    expect(asContentType(null)).toBeUndefined()
  })
})

describe('inferContentType', () => {
  it('an already-resolved contentType wins over every other signal', () => {
    expect(
      inferContentType({
        contentType: 'article',
        platform: 'tiktok',
        hasVideo: true,
        thumbnailUrl: 'https://pbs.twimg.com/media/photo.jpg',
      }),
    ).toBe('article')
  })

  it('tiktok / youtube / instagram are always video when unresolved', () => {
    expect(inferContentType({ platform: 'tiktok' })).toBe('video')
    expect(inferContentType({ platform: 'youtube', hasPhoto: true })).toBe('video')
    expect(inferContentType({ platform: 'instagram' })).toBe('video')
  })

  it('article beats video/photo so an X Article with a cover is still an article', () => {
    expect(
      inferContentType({
        isXArticle: true,
        hasPhoto: true,
        primaryMediaType: 'photo',
        hasFirstClassMedia: true,
      }),
    ).toBe('article')
    expect(inferContentType({ category: 'article', hasVideo: true })).toBe('article')
    expect(inferContentType({ hasArticleBlocks: true, hasPhoto: true })).toBe('article')
  })

  it('a link-preview-only post (no first-class media) is article', () => {
    expect(
      inferContentType({
        hasArticlePreview: true,
        hasFirstClassMedia: false,
      }),
    ).toBe('article')
  })

  it('a tweet with a photo AND a link preview is photo, not article', () => {
    expect(
      inferContentType({
        hasArticlePreview: true,
        hasFirstClassMedia: true,
        primaryMediaType: 'photo',
      }),
    ).toBe('photo')
  })

  it('video / gif / photo / text follow after article; quote is not a type', () => {
    expect(inferContentType({ primaryMediaType: 'video' })).toBe('video')
    expect(inferContentType({ primaryMediaType: 'animated_gif' })).toBe('video')
    expect(inferContentType({ hasVideo: true })).toBe('video')
    expect(inferContentType({ primaryMediaType: 'photo' })).toBe('photo')
    expect(inferContentType({})).toBe('text')
  })

  it('a stored quote type re-infers from media (photo tweets were mis-flagged)', () => {
    expect(asContentType('quote')).toBeUndefined()
    expect(
      inferContentType({
        contentType: 'quote',
        hasPhoto: true,
        primaryMediaType: 'photo',
      }),
    ).toBe('photo')
    expect(inferContentType({ contentType: 'quote' })).toBe('text')
  })

  it('thumbnail heuristics only apply when nothing else resolved', () => {
    expect(
      inferContentType({
        thumbnailUrl: 'https://pbs.twimg.com/profile_images/1/avatar.jpg',
      }),
    ).toBe('text')
    expect(
      inferContentType({
        thumbnailUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/1/img.jpg',
      }),
    ).toBe('video')
    expect(
      inferContentType({
        thumbnailUrl: 'https://pbs.twimg.com/media/photo.jpg',
      }),
    ).toBe('photo')
  })
})
