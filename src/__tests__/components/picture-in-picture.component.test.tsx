/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { TheaterPictureInPictureButton } from '@/components/theater/TheaterPictureInPictureButton'
import { useVideoPictureInPicture } from '@/components/theater/useVideoPictureInPicture'

function Player({ covered = false, src = '/first.mp4' }) {
  const ref = useRef<HTMLVideoElement>(null)
  useVideoPictureInPicture(ref, covered)
  return <video ref={ref} src={src} />
}
function Harness({ covered = false, src = '/first.mp4', mounted = true }) {
  return (
    <>
      <TheaterPictureInPictureButton className="" />
      {mounted && <Player covered={covered} src={src} />}
    </>
  )
}
let pipElement: Element | null = null
let request: ReturnType<typeof vi.fn>
let exit: ReturnType<typeof vi.fn<() => Promise<void>>>
const properties: Array<[object, string]> = []
function property(target: object, name: string, value: unknown) {
  properties.push([target, name])
  Object.defineProperty(target, name, { configurable: true, value })
}
function load(video: HTMLVideoElement) {
  property(video, 'readyState', 4)
  property(video, 'videoWidth', 640)
  fireEvent.loadedMetadata(video)
}
beforeEach(() => {
  pipElement = null
  property(document, 'pictureInPictureEnabled', true)
  properties.push([document, 'pictureInPictureElement'])
  Object.defineProperty(document, 'pictureInPictureElement', {
    configurable: true,
    get: () => pipElement,
  })
  request = vi.fn(function (this: HTMLVideoElement) {
    pipElement = this
    this.dispatchEvent(new Event('enterpictureinpicture'))
    return Promise.resolve({})
  })
  exit = vi.fn(async () => {
    const previous = pipElement
    pipElement = null
    previous?.dispatchEvent(new Event('leavepictureinpicture'))
  })
  property(HTMLVideoElement.prototype, 'requestPictureInPicture', request)
  property(document, 'exitPictureInPicture', exit)
})
afterEach(() => {
  cleanup()
  for (const [target, name] of properties.splice(0)) Reflect.deleteProperty(target, name)
})

describe('theater picture-in-picture', () => {
  it('waits for actual video metadata, enters from the click, and mirrors native close', async () => {
    const { container } = render(<Harness />)
    const video = container.querySelector('video')!
    expect(screen.getByRole('button')).toBeDisabled()
    load(video)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Picture-in-picture' }))
      expect(request).toHaveBeenCalledOnce()
    })
    expect(screen.getByRole('button', { name: 'Exit picture-in-picture' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await act(async () => {
      await exit()
    })
    expect(screen.getByRole('button', { name: 'Picture-in-picture' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('closes from the control and keeps the same media element on source changes', async () => {
    const { container, rerender } = render(<Harness />)
    const video = container.querySelector('video')!
    load(video)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    rerender(<Harness src="/next.mp4" />)
    expect(container.querySelector('video')).toBe(video)
    expect(exit).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(exit).toHaveBeenCalledOnce()
  })

  it.each(['unsupported', 'disabled'])('hides the control when %s', (mode) => {
    if (mode === 'unsupported') property(document, 'pictureInPictureEnabled', false)
    else property(HTMLVideoElement.prototype, 'disablePictureInPicture', true)
    render(<Harness />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a retryable error when permission is rejected', async () => {
    request.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    const { container } = render(<Harness />)
    load(container.querySelector('video')!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByRole('status')).toHaveTextContent('Try again')
    expect(screen.getByRole('button')).toBeEnabled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(pipElement).toBe(container.querySelector('video'))
  })

  it('exits and hides the control when another stage covers the video', async () => {
    const { container, rerender } = render(<Harness />)
    load(container.querySelector('video')!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    await act(async () => {
      rerender(<Harness covered />)
    })
    expect(exit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button')).toBeNull()
    expect(pipElement).toBeNull()
  })

  it('cleans up a late entry after unmount and blocks duplicate requests', async () => {
    let finish!: () => void
    request.mockImplementation(function (this: HTMLVideoElement) {
      return new Promise<void>((resolve) => {
        finish = () => {
          pipElement = this
          resolve()
        }
      })
    })
    const { container, rerender } = render(<Harness />)
    load(container.querySelector('video')!)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toBeDisabled()
    fireEvent.click(screen.getByRole('button'))
    expect(request).toHaveBeenCalledOnce()
    rerender(<Harness mounted={false} />)
    await act(async () => {
      finish()
    })
    expect(pipElement).toBeNull()
    expect(exit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does not close a different player during cleanup', () => {
    const { unmount } = render(<Harness />)
    pipElement = document.createElement('video')
    unmount()
    expect(exit).not.toHaveBeenCalled()
  })

  it('uses Safari presentation mode when the standard API is unavailable', async () => {
    property(document, 'pictureInPictureEnabled', false)
    property(HTMLVideoElement.prototype, 'webkitSupportsPresentationMode', () => true)
    const setMode = vi.fn(function (this: HTMLVideoElement, mode: string) {
      property(this, 'webkitPresentationMode', mode)
      this.dispatchEvent(new Event('webkitpresentationmodechanged'))
    })
    property(HTMLVideoElement.prototype, 'webkitSetPresentationMode', setMode)
    const { container } = render(<Harness />)
    load(container.querySelector('video')!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(setMode).toHaveBeenLastCalledWith('picture-in-picture')
    expect(screen.getByRole('button', { name: 'Exit picture-in-picture' })).toBeEnabled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(setMode).toHaveBeenLastCalledWith('inline')
    expect(request).not.toHaveBeenCalled()
  })
})
