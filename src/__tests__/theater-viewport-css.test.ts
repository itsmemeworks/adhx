import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const globalsCss = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8')
const theaterShell = readFileSync(resolve(root, 'src/components/theater/TheaterShell.tsx'), 'utf8')
const mobileChrome = readFileSync(
  resolve(root, 'src/components/theater/TheaterMobileChrome.tsx'),
  'utf8',
)
const previewLoading = readFileSync(
  resolve(root, 'src/components/theater/TheaterPreviewLoading.tsx'),
  'utf8',
)

describe('mobile Theater viewport', () => {
  it('paints through the iOS bottom toolbar while fixing chrome to the visible viewport', () => {
    expect(theaterShell).toContain('theater-shell-viewport fixed inset-0')
    expect(mobileChrome).toContain(
      'theater-mobile-top-chrome pointer-events-none absolute inset-x-0 top-0',
    )
    expect(previewLoading).toContain(
      'theater-mobile-top-chrome pointer-events-none absolute inset-x-0 top-0',
    )
    expect(globalsCss).toMatch(
      /html:has\(\.theater-shell-viewport\),\s*body:has\(\.theater-shell-viewport\)\s*\{[^}]*overflow: hidden;/,
    )
    expect(globalsCss).toMatch(
      /@media \(max-width: 1023px\)\s*\{\s*@supports \(-webkit-touch-callout: none\)\s*\{[\s\S]*?\.theater-shell-viewport\s*\{[^}]*position: absolute;[^}]*bottom: auto;[^}]*height: 100vh;[^}]*height: 100lvh;/,
    )
    expect(globalsCss).toMatch(
      /@supports \(-webkit-touch-callout: none\)[\s\S]*\.theater-mobile-top-chrome\s*\{[^}]*position: fixed;/,
    )
    expect(globalsCss).toMatch(/\.theater-mobile-top-chrome\s*\{[^}]*z-index: 71;/)
  })
})
