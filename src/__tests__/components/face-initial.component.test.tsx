// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FaceInitial } from '@/components/next/FaceInitial'
import { faceColour } from '@/components/next/faces'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'

describe('FaceInitial', () => {
  it('draws the initial on the member’s colour, never as text', () => {
    const { container } = render(<FaceInitial username="ana" name="Ana" size={96} />)
    const face = container.querySelector('[data-face="initial"]')
    expect(face).toHaveAttribute('data-initial', 'A')
    expect(face).toHaveStyle({ background: faceColour('ana') })
    expect(container.textContent).toBe('')
  })

  it('stands in for a missing photo in the old feed’s avatar too', () => {
    const { container } = render(<AuthorAvatar author="jo" />)
    expect(screen.getByRole('img', { name: 'jo' })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-initial="J"]')).not.toBeNull()
  })
})
