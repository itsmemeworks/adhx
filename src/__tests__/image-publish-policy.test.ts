import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('release-only image publication', () => {
  it('publishes automatically only through a newly created Release Please release', () => {
    const publisher = readFileSync('.github/workflows/image-publish.yml', 'utf8')
    const release = readFileSync('.github/workflows/release-please.yml', 'utf8')
    const triggers = publisher.split('\npermissions:')[0]
    expect(triggers).not.toMatch(/^  (push|pull_request|release):/m)
    expect(triggers).toMatch(/^  workflow_call:/m)
    expect(triggers).toMatch(/^  workflow_dispatch:/m)
    expect(triggers).not.toContain('required: false')
    expect(release).toContain("if: ${{ needs.release-please.outputs.release_created == 'true' }}")
    expect(release).toContain('uses: ./.github/workflows/image-publish.yml')
    expect(release).toContain('version: ${{ needs.release-please.outputs.version }}')
    expect(publisher).toContain('group: publish-container-${{ needs.prepare.outputs.sha }}')
    expect(publisher).toContain('cancel-in-progress: false')
  })

  it('does not treat documentation and maintenance commits as release notes', () => {
    const config = JSON.parse(readFileSync('release-please-config.json', 'utf8'))
    const sections = config.packages['.']['changelog-sections'] as {
      type: string
      hidden: boolean
    }[]
    for (const type of ['docs', 'style', 'chore', 'refactor', 'test', 'build', 'ci'])
      expect(sections.find((section) => section.type === type)?.hidden).toBe(true)
    for (const type of ['feat', 'fix', 'perf', 'security', 'revert'])
      expect(sections.find((section) => section.type === type)?.hidden).toBe(false)
  })

  it('rejects blank recovery input before resolving or building an untagged main commit', () => {
    expect(() =>
      execFileSync(process.execPath, [resolve('.github/scripts/image-plan.mjs')], {
        env: { ...process.env, RAW_VERSION: '', GITHUB_REF: 'refs/heads/main' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).toThrow('A tagged release version is required')
  })
})
