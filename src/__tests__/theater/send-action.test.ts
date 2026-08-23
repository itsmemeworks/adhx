import { describe, expect, it } from 'vitest'
import { fileSendCopy, textCopyAction } from '@/components/theater/send-action'

describe('fileSendCopy', () => {
  it('labels a video Download and uses a film icon', () => {
    const action = fileSendCopy('video')
    expect(action.label).toBe('Download')
    expect(action.title).toBe('Download the video')
    expect(action.Icon.displayName).toBe('Film')
  })

  it('labels a photo Download and uses an image icon', () => {
    const action = fileSendCopy('photo')
    expect(action.label).toBe('Download')
    expect(action.title).toBe('Download the photo')
    expect(action.Icon.displayName).toBe('Image')
  })
})

describe('textCopyAction', () => {
  it('labels a tweet Copy and uses a copy icon', () => {
    const action = textCopyAction('text')
    expect(action.idleLabel).toBe('Copy')
    expect(action.copiedLabel).toBe('Copied')
    expect(action.title).toBe("Copy the post's text")
    expect(action.Icon.displayName).toBe('Copy')
    expect(textCopyAction('quote').idleLabel).toBe('Copy')
    expect(textCopyAction('quote').title).toBe("Copy the post's text")
  })

  it('labels an article Copy and uses a file-text icon', () => {
    const action = textCopyAction('article')
    expect(action.idleLabel).toBe('Copy')
    expect(action.copiedLabel).toBe('Copied')
    expect(action.title).toBe('Copy the article')
    expect(action.Icon.displayName).toBe('FileText')
  })
})
