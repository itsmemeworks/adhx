/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TheaterPreviewLoading } from '@/components/theater/TheaterPreviewLoading'

describe('TheaterPreviewLoading', () => {
  it('paints the Theater shell and resolving post before a cold route settles', () => {
    render(<TheaterPreviewLoading />)

    expect(screen.getByTestId('theater-preview-loading-shell')).toBeInTheDocument()
    expect(screen.getByTestId('theater-stage')).toContainElement(
      screen.getByTestId('stage-resolving'),
    )
    expect(screen.getByTestId('stage-resolving').querySelector('img')).toHaveAttribute(
      'src',
      '/gob-loader.svg',
    )
    expect(screen.getByTestId('theater-loading-desktop-chrome')).toBeInTheDocument()
    expect(screen.getByTestId('theater-loading-mobile-chrome')).toBeInTheDocument()
  })
})
