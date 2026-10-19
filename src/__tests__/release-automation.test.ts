import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { validateRelease } = require('../../.github/scripts/release-validation.cjs')
const checkReleasePr = require('../../.github/scripts/check-release-pr.cjs')
const { imagePlan, normalizeVersion } = require('../../.github/scripts/image-plan.mjs')

function release() {
  return {
    pr: {
      number: 1,
      user: { login: 'github-actions[bot]' },
      head: { ref: 'release-please--branches--main', sha: 'new', repo: { full_name: 'owner/app' } },
      base: { ref: 'main', sha: 'base', repo: { full_name: 'owner/app' } },
    },
    files: ['package.json', '.release-please-manifest.json', 'CHANGELOG.md'].map((filename) => ({
      filename,
      status: 'modified',
    })),
    basePackage: {
      version: '2.0.1',
      scripts: { build: 'next build' },
      dependencies: { next: '16.3.8' },
    },
    headPackage: {
      version: '2.0.2',
      scripts: { build: 'next build' },
      dependencies: { next: '16.3.8' },
    },
    baseManifest: { '.': '2.0.1' },
    headManifest: { '.': '2.0.2' },
    changelog: '# Changelog\n\n## [2.0.2]\nFixes.',
  }
}

describe('release metadata validation', () => {
  it('accepts a real version/changelog-only release', () =>
    expect(validateRelease(release())).toBe('2.0.2'))
  it.each(['scripts', 'dependencies'])('rejects changes to package %s', (field) => {
    const input = release()
    Object.assign(input.headPackage[field as 'scripts'], { injected: 'anything' })
    expect(() => validateRelease(input)).toThrow('package settings or dependencies')
  })
  it.each(['src/app/page.tsx', '.github/workflows/ci.yml', 'pnpm-lock.yaml'])(
    'rejects extra file %s',
    (filename) => {
      const input = release()
      input.files.push({ filename, status: 'modified' })
      expect(() => validateRelease(input)).toThrow('must modify only')
    },
  )
  it('rejects removed metadata', () => {
    const input = release()
    input.files[0].status = 'removed'
    expect(() => validateRelease(input)).toThrow('must modify only')
  })
  it('does not trust a branch name alone', () => {
    const input = release()
    input.pr.user.login = 'someone-else'
    expect(() => validateRelease(input)).toThrow('trusted')
  })
  it('rejects fork and wrong-base release PRs', () => {
    const fork = release()
    fork.pr.head.repo.full_name = 'fork/app'
    expect(() => validateRelease(fork)).toThrow('trusted')
    const wrongBase = release()
    wrongBase.pr.base.ref = 'other'
    expect(() => validateRelease(wrongBase)).toThrow('trusted')
  })
  it('rejects a mismatched manifest or missing changelog version', () => {
    const input = release()
    input.headManifest['.'] = '2.0.3'
    expect(() => validateRelease(input)).toThrow('versions must agree')
    input.headManifest['.'] = '2.0.2'
    input.changelog = '# Changelog'
    expect(() => validateRelease(input)).toThrow('Changelog')
  })
  it.each(['2.0.0', '2.0.1', '2.0.2-rc.1', '2.00.2'])(
    'rejects non-advancing or invalid version %s',
    (version) => {
      const input = release()
      input.headPackage.version = version
      expect(() => validateRelease(input)).toThrow('must advance')
    },
  )
})

describe('release check reporting', () => {
  function api(input = release()) {
    const create = vi.fn()
    const setFailed = vi.fn()
    const github = {
      paginate: vi.fn().mockResolvedValue(input.files),
      rest: {
        pulls: {
          list: vi.fn().mockResolvedValue({ data: [input.pr] }),
          listFiles: vi.fn(),
          get: vi.fn().mockResolvedValue({ data: input.pr }),
        },
        repos: {
          getContent: vi.fn(async ({ path, ref }: { path: string; ref: string }) => {
            const body =
              path === 'CHANGELOG.md'
                ? input.changelog
                : JSON.stringify(
                    path === 'package.json'
                      ? ref === 'base'
                        ? input.basePackage
                        : input.headPackage
                      : ref === 'base'
                        ? input.baseManifest
                        : input.headManifest,
                  )
            return {
              data: {
                type: 'file',
                encoding: 'base64',
                content: Buffer.from(body).toString('base64'),
              },
            }
          }),
        },
        checks: { create },
      },
    }
    return {
      github,
      context: { repo: { owner: 'owner', repo: 'app' } },
      core: { setFailed },
      create,
      setFailed,
    }
  }
  it('reports success only after validating actual file contents', async () => {
    const mock = api()
    await checkReleasePr(mock)
    expect(
      mock.create.mock.calls.map(([check]) => [check.name, check.conclusion, check.head_sha]),
    ).toEqual([
      ['build', 'success', 'new'],
      ['format', 'success', 'new'],
      ['test', 'success', 'new'],
    ])
    expect(mock.setFailed).not.toHaveBeenCalled()
  })
  it('fails all required checks for a disguised code change', async () => {
    const input = release()
    input.headPackage.scripts.build = 'malicious script'
    const mock = api(input)
    await checkReleasePr(mock)
    expect(mock.create.mock.calls.every(([check]) => check.conclusion === 'failure')).toBe(true)
    expect(mock.setFailed).toHaveBeenCalled()
  })
  it('cannot approve a head that moved during validation', async () => {
    const mock = api()
    mock.github.rest.pulls.get.mockResolvedValue({
      data: { ...release().pr, head: { sha: 'different' } },
    })
    await checkReleasePr(mock)
    expect(mock.create.mock.calls.every(([check]) => check.conclusion === 'failure')).toBe(true)
  })
})

describe('immutable commit images and release promotion', () => {
  const sha = 'a'.repeat(40)
  const repository = 'Owner/App'
  it('rejects publishing untagged snapshots', () => {
    expect(() => imagePlan({ sha, repository })).toThrow('tagged release version')
  })
  it('promotes the latest stable release without changing source identity', () => {
    const plan = imagePlan({
      sha,
      repository,
      version: 'v2.1.0',
      latestRelease: 'v2.1.0',
    })
    expect(plan.sha).toBe(sha)
    expect(plan.tags).toEqual([
      `ghcr.io/owner/app:sha-${sha}`,
      'ghcr.io/owner/app:2.1.0',
      'ghcr.io/owner/app:2.1',
      'ghcr.io/owner/app:2',
      'ghcr.io/owner/app:latest',
    ])
  })
  it('does not roll latest backward when an older build finishes late', () => {
    expect(imagePlan({ sha, repository, version: '2.0.1', latestRelease: 'v2.1.0' }).tags).toEqual([
      `ghcr.io/owner/app:sha-${sha}`,
      'ghcr.io/owner/app:2.0.1',
    ])
  })
  it('never promotes a prerelease to stable aliases', () => {
    expect(
      imagePlan({ sha, repository, version: '2.1.0-rc.1', latestRelease: 'v2.1.0-rc.1' }).tags,
    ).toEqual([`ghcr.io/owner/app:sha-${sha}`, 'ghcr.io/owner/app:2.1.0-rc.1'])
  })
  it.each(['../../main', '2.1', '2.1.0;echo bad', '02.1.0', '2.1.0+metadata'])(
    'rejects unsafe or invalid version %s',
    (version) => {
      expect(() => normalizeVersion(version)).toThrow()
    },
  )
  it('rejects a mutable source ref', () =>
    expect(() => imagePlan({ sha: 'main', repository })).toThrow('immutable'))
})

describe('release source resolution', () => {
  it('resolves the release tag instead of building a newer main checkout', () => {
    const temp = mkdtempSync(join(tmpdir(), 'adhx-release-plan-'))
    // Drop the GIT_* variables a commit hook runs under (GIT_INDEX_FILE,
    // GIT_DIR…): with them, these commands would act on this repository
    // instead of the scratch ones below.
    const inherited = { ...process.env }
    for (const name of Object.keys(inherited)) {
      if (name.startsWith('GIT_')) delete inherited[name]
    }
    const env = {
      ...inherited,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    }
    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
        cwd,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    try {
      git(temp, 'init', '--quiet', '--initial-branch=main', 'source')
      const source = join(temp, 'source')
      writeFileSync(join(source, 'package.json'), '{"version":"2.0.1"}')
      git(source, 'add', '.')
      git(source, 'commit', '--quiet', '-m', 'release')
      const releaseSha = git(source, 'rev-parse', 'HEAD')
      git(source, 'tag', 'v2.0.1')
      writeFileSync(join(source, 'package.json'), '{"version":"2.0.2"}')
      git(source, 'add', '.')
      git(source, 'commit', '--quiet', '-m', 'new main')
      git(temp, 'clone', '--quiet', source, 'checkout')
      const output = join(temp, 'outputs')
      execFileSync(process.execPath, [resolve('.github/scripts/image-plan.mjs')], {
        cwd: join(temp, 'checkout'),
        env: {
          ...env,
          RAW_VERSION: 'v2.0.1',
          GITHUB_REPOSITORY: 'owner/app',
          GITHUB_REF: 'refs/heads/main',
          GITHUB_OUTPUT: output,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      expect(readFileSync(output, 'utf8')).toContain(`sha=${releaseSha}\n`)
      expect(readFileSync(output, 'utf8')).toContain('package_version=2.0.1\n')
      expect(readFileSync(output, 'utf8')).toContain('version=2.0.1\n')
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })
})
