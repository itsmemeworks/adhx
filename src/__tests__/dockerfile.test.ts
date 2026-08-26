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
    expect(packageJson.packageManager).toBe('pnpm@9.15.9')
    expect(dockerfile).toContain('ENV PNPM_HOME="/pnpm"')
    expect(dockerfile).toContain('corepack enable')
    expect(dockerfile).toContain('corepack prepare pnpm@9.15.9 --activate')
    expect(dockerfile).toContain('pnpm install --frozen-lockfile')
    expect(dockerfile).toContain('pnpm run build')
  })

  it('uses production dependencies and the project-local tsx at runtime', () => {
    expect(packageJson.dependencies?.tsx).toBeDefined()
    expect(packageJson.devDependencies?.tsx).toBeUndefined()
    expect(dockerfile).toContain('pnpm prune --prod')
    expect(dockerfile).toContain('cp -a /app/node_modules ./node_modules')
    expect(dockerfile).toContain('./node_modules/.bin/tsx src/lib/db/migrate.ts')
  })

  it('does not install dependencies with npm or install a global tsx', () => {
    expect(dockerfile).not.toMatch(/\bnpm\s+(?:ci|install)\b/)
    expect(dockerfile).not.toMatch(/\b(?:npm|pnpm)\b[^\n]*(?:-g|--global)[^\n]*\btsx\b/)
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
    expect(containerSmokeJob).toContain("!startsWith(github.head_ref || '', 'release-please--')")
    expect(containerSmokeJob).toContain('--target runner')
    expect(containerSmokeJob).toContain('IMAGE_TAG: adhx-ci:${{ github.sha }}')
  })

  it('exercises the non-root runtime dependencies and migration', () => {
    expect(containerSmokeJob).toContain('test "$(id -u)" = "1001"')
    expect(containerSmokeJob).toContain('test -x ./node_modules/.bin/tsx')
    expect(containerSmokeJob).toContain('require("better-sqlite3")')
    expect(containerSmokeJob).toContain('./node_modules/.bin/tsx src/lib/db/migrate.ts')
    expect(containerSmokeJob).toContain('integrity_check')
  })

  it('starts the image command, checks health, and always cleans up', () => {
    expect(containerSmokeJob).toContain('docker run --detach')
    expect(containerSmokeJob).toContain('http://127.0.0.1:3000/api/health')
    expect(containerSmokeJob).toContain('for attempt in $(seq 1 30)')
    expect(containerSmokeJob).toContain('- name: Show runner diagnostics')
    expect(containerSmokeJob).toContain('if: always()')
    expect(containerSmokeJob).toContain('docker rm --force "$CONTAINER_NAME"')
  })
})
