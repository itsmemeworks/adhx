/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { VideoPlayer } from '@/components/feed/VideoPlayer'

vi.mock('hls.js', () => ({
  default: { isSupported: () => false },
}))

describe('VideoPlayer Instagram', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a spinner until the MP4 proxy is ready, then attaches <video src>', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      body: { cancel: vi.fn() },
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <VideoPlayer author="x" tweetId="DXVsqQ7CSXw" platform="instagram" />,
    )

    expect(screen.getByRole('status', { name: /loading video/i })).toBeInTheDocument()
    expect(container.querySelector('video')).toBeNull()

    await waitFor(() => {
      const video = container.querySelector('video')
      expect(video?.getAttribute('src')).toBe('/api/media/instagram/video?id=DXVsqQ7CSXw')
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media/instagram/video?id=DXVsqQ7CSXw',
      expect.objectContaining({
        headers: { Range: 'bytes=0-1' },
      }),
    )
  })

  it('falls back to the official Instagram embed when the MP4 never arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        body: { cancel: vi.fn() },
      }),
    )

    const { container } = render(
      <VideoPlayer author="x" tweetId="DXVsqQ7CSXw" platform="instagram" />,
    )

    await waitFor(() => {
      expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://www.instagram.com/reel/DXVsqQ7CSXw/embed/',
      )
    })
    expect(container.querySelector('video')).toBeNull()
  })
})
