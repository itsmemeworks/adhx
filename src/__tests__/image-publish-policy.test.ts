import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  IMAGE_IGNORED_PATHS,
  hasImageChanges,
  mainImageEquivalent,
} = require('../../.github/scripts/image-policy.mjs')
const { imagePlan } = require('../../.github/scripts/image-plan.mjs')

describe('image publication file policy', () => {
  it('skips guides, environment examples and licensing without skipping mixed code', () => {
    const docs = [
      'README.md',
      'AGENTS.md',
      'docs/releasing.md',
      'deploy/nas/.env.example',
      '.env.example',
      'LICENSE',
    ]
    expect(hasImageChanges(docs)).toBe(false)
    for (const runtime of [
      'src/app/page.tsx',
      'src/app/guide.md',
      'public/help.md',
      'Dockerfile',
      '.dockerignore',
      'package.json',
      '.github/workflows/image-publish.yml',
      'new-tool/config.json',
    ])
      expect(hasImageChanges([...docs, runtime])).toBe(true)
  })

  it('keeps the actual push filter aligned with the promotion policy', () => {
    const workflow = readFileSync('.github/workflows/image-publish.yml', 'utf8')
    const block = workflow.match(/    paths-ignore:\n((?:      - .*\n)+)/)?.[1]
    expect(block).toBeTruthy()
    const patterns = block!
      .trim()
      .split('\n')
      .map((line) => line.trim().slice(2).replace(/^'|'$/g, ''))
    expect(patterns.sort()).toEqual([...IMAGE_IGNORED_PATHS].sort())
  })
})

describe('main promotion across documentation merges', () => {
  it('promotes the real code image across docs, but rejects newer code, moved runtime files and unrelated history', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'adhx-image-policy-'))
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    }
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
        cwd,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    const commit = (message: string) => {
      git('add', '.')
      git('commit', '--quiet', '-m', message)
      return git('rev-parse', 'HEAD')
    }
    try {
      git('init', '--quiet', '--initial-branch=main')
      mkdirSync(join(cwd, 'src'))
      mkdirSync(join(cwd, 'docs'))
      writeFileSync(join(cwd, 'src/app.ts'), 'export const value = 1')
      const source = commit('application')
      writeFileSync(join(cwd, 'docs/setup.md'), 'A guide')
      writeFileSync(join(cwd, '.env.example'), 'EXAMPLE=1')
      const docs = commit('docs')
      expect(mainImageEquivalent(source, docs, cwd)).toBe(true)
      expect(
        imagePlan({
          sha: source,
          currentMain: docs,
          repository: 'owner/app',
          mainEquivalent: mainImageEquivalent(source, docs, cwd),
        }).tags,
      ).toEqual([`ghcr.io/owner/app:sha-${source}`, 'ghcr.io/owner/app:main'])
      writeFileSync(join(cwd, 'src/app.ts'), 'export const value = 2')
      const newer = commit('newer application')
      expect(mainImageEquivalent(source, newer, cwd)).toBe(false)
      expect(mainImageEquivalent(newer, docs, cwd)).toBe(false)
      git('checkout', '--detach', docs)
      renameSync(join(cwd, 'src/app.ts'), join(cwd, 'docs/app.ts'))
      const moved = commit('move runtime file')
      expect(mainImageEquivalent(docs, moved, cwd)).toBe(false)
      expect(mainImageEquivalent(moved, newer, cwd)).toBe(false)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('rejects mutable or malformed source identities before invoking git', () => {
    expect(() => mainImageEquivalent('main', 'a'.repeat(40))).toThrow('immutable')
    expect(() => mainImageEquivalent('a'.repeat(40), '--all')).toThrow('immutable')
  })
})
