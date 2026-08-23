import { describe, expect, it } from 'vitest'
import { fileSendCopy, textCopyAction } from '@/components/theater/send-action'

describe('fileSendCopy', () => {
  it('names a video download Video and uses a film icon', () => {
    const action = fileSendCopy('video')
    expect(action.label).toBe('Video')
    expect(action.title).toBe('Download the video')
    expect(action.Icon.displayName).toBe('Film')
  })

  it('names a photo download Photo and uses an image icon', () => {
    const action = fileSendCopy('photo')
    expect(action.label).toBe('Photo')
    expect(action.title).toBe('Download the photo')
    expect(action.Icon.displayName).toBe('Image')
  })
})

describe('textCopyAction', () => {
  it('labels a tweet Copy text', () => {
    expect(textCopyAction('text').idleLabel).toBe('Copy text')
    expect(textCopyAction('quote').idleLabel).toBe('Copy text')
  })

  it('labels an article Copy article', () => {
    expect(textCopyAction('article').idleLabel).toBe('Copy article')
    expect(textCopyAction('article').title).toBe('Copy the article')
  })
})
