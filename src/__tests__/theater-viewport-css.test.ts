import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const globalsCss = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8')
const theaterShell = readFileSync(resolve(root, 'src/components/theater/TheaterShell.tsx'), 'utf8')

describe('mobile Theater viewport', () => {
  it('avoids the iOS fixed-viewport clipping gap without changing other browsers', () => {
    expect(theaterShell).toContain('theater-shell-viewport fixed inset-0')
    expect(globalsCss).toMatch(
      /@media \(max-width: 1023px\)\s*\{\s*@supports \(-webkit-touch-callout: none\)\s*\{\s*\.theater-shell-viewport\s*\{[^}]*position: absolute;[^}]*bottom: auto;[^}]*height: 100vh;[^}]*height: 100lvh;/,
    )
  })
})
