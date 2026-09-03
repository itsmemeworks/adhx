import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const globalsCss = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8')
const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8')) as {
  background_color?: string
  theme_color?: string
}

describe('dark-only theme', () => {
  it('keeps the single Matter palette dark without dropping shared shape tokens', () => {
    expect(globalsCss).toContain('--background: 31 21% 7%')
    expect(globalsCss).toContain('--radius: 0.75rem')
    expect(globalsCss).toContain('color-scheme: dark')
    expect(globalsCss).not.toMatch(/^\s*\.light\s*\{/m)
  })

  it('uses a dark installed-app launch surface', () => {
    expect(manifest.background_color).toBe('#08070a')
    expect(manifest.theme_color).toBe('#08070a')
  })
})
