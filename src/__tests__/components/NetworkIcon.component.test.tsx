/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NetworkIcon } from '@/components/next/NetworkIcon'
import { ALL_PLATFORMS } from '@/lib/platform/networks'

describe('NetworkIcon', () => {
  it.each(ALL_PLATFORMS)('draws a mark for %s', (platform) => {
    const { container } = render(<NetworkIcon platform={platform} className="h-5 w-5" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('path, text')).not.toBeNull()
  })

  it('treats a missing platform as X, and draws nothing for an unknown one', () => {
    expect(render(<NetworkIcon platform={null} />).container.querySelector('svg')).not.toBeNull()
    expect(render(<NetworkIcon platform="myspace" />).container.innerHTML).toBe('')
  })
})
