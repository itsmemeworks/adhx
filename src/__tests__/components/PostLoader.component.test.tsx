/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostLoader } from '@/components/PostLoader'

describe('PostLoader', () => {
  it('uses the dark loader and exposes one loading status', () => {
    const { container } = render(
      <PostLoader variant="dark" size={72} caption="grabbing it…" label="Loading Saved posts" />,
    )

    expect(screen.getByRole('status', { name: 'Loading Saved posts' })).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', '/gob-loader.svg')
    expect(screen.getByText('grabbing it…')).toBeInTheDocument()
  })

  it('renders theme-selectable loaders without duplicate status announcements', () => {
    const { container } = render(<PostLoader variant="auto" />)

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(Array.from(container.querySelectorAll('img')).map((image) => image.src)).toEqual([
      'http://localhost:3000/gob-loader-paper.svg',
      'http://localhost:3000/gob-loader.svg',
    ])
  })

  it('can be decorative inside an existing loading status', () => {
    render(<PostLoader variant="paper" decorative />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
