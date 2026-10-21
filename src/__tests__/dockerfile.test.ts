import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
const ciWorkflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
const containerSmokeJob = ciWorkflow.slice(
  ciWorkflow.indexOf('  container-smoke:'),
  ciWorkflow.indexOf('  # Dedicated formatting gate'),
)
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  packageManager?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('production container dependencies', () => {
  it('pins pnpm and installs the frozen lockfile', () => {
    expect(packageJson.packageManager).toMatch(/^pnpm@10\.\d+\.\d+$/)
    const [, minor, patch] = packageJson.packageManager!.match(/^pnpm@10\.(\d+)\.(\d+)$/)!
    expect(Number(minor) > 34 || (Number(minor) === 34 && Number(patch) >= 5)).toBe(true)
    expect(dockerfile).toContain('ENV PNPM_HOME="/pnpm"')
    expect(dockerfile).toContain(
      `npm install --global --ignore-scripts ${packageJson.packageManager}`,
    )
    expect(dockerfile).not.toContain('corepack enable')
    expect(dockerfile).toContain('COPY package.json pnpm-lock.yaml .npmrc ./')
    expect(readFileSync(join(root, '.npmrc'), 'utf8')).toContain('strict-dep-builds=true')
    expect(dockerfile).toContain('pnpm install --frozen-lockfile')
    expect(dockerfile).toContain('pnpm run build')
  })

  it('uses production dependencies and the project-local tsx at runtime', () => {
    expect(packageJson.dependencies?.tsx).toBeDefined()
    expect(packageJson.devDependencies?.tsx).toBeUndefined()
    expect(dockerfile).toContain('pnpm prune --prod --ignore-scripts')
    expect(dockerfile).toContain('cp -a /app/node_modules ./node_modules')
    expect(dockerfile).toContain('./node_modules/.bin/tsx src/lib/db/migrate.ts')
  })

  it('does not install application dependencies with npm or install a global tsx', () => {
    expect(dockerfile).not.toMatch(/\bnpm\s+(?:ci|install)\b(?!\s+--global\b)/)
    expect(dockerfile).not.toMatch(/\b(?:npm|pnpm)\b[^\n]*(?:-g|--global)[^\n]*\btsx\b/)
  })

  it('starts the runner from a fresh Node image and excludes package-manager toolchains', () => {
    const runner = dockerfile.match(/^FROM (\S+) AS runner\n([\s\S]*)$/m)
    expect(runner).not.toBeNull()
    expect(runner![1]).toMatch(/^node:26-/)
    // Native SQLite dependencies must be built for the same runtime as the server.
    expect(dockerfile.match(/^FROM (\S+) AS base$/m)?.[1]).toBe(runner![1])
    expect(runner![2]).not.toMatch(/(?:corepack prepare|pnpm install|COPY --from=base)/)
    expect(runner![2]).toContain('/usr/local/lib/node_modules/npm')
    expect(runner![2]).toContain('/usr/local/lib/node_modules/corepack')
    // The runtime smoke script checks the assembled filesystem on both Linux
    // architectures; these source guards catch accidental stage inheritance early.
  })

  it('keeps the standalone server and non-root runtime', () => {
    expect(dockerfile).toContain('COPY --from=builder /app/.next/standalone ./')
    expect(dockerfile).toContain('COPY --from=runtime-files --chown=nextjs:nodejs /runtime ./')
    expect(dockerfile).toContain('USER nextjs')
  })
})

describe('production container CI smoke test', () => {
  it('builds the real runner under the normal CI guards', () => {
    expect(ciWorkflow).toContain('container-smoke:')
    expect(containerSmokeJob).toContain("github.event_name != 'workflow_run'")
    expect(containerSmokeJob).toContain('--target runner')
    expect(containerSmokeJob).toContain('IMAGE_TAG: adhx-ci:${{ github.sha }}')
  })

  // Runtime dependency, health and cleanup checks now execute against the
  // assembled image on both native Linux architectures in CI. Workflow-string
  // assertions cannot establish those behaviours and duplicated its old layout.
})
