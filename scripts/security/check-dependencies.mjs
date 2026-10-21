import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
// No upstream fix exists. Only trusted repository globs reach these dev tools.
// Production audits never accept this exception; new advisories fail closed.
export function rejectedAdvisories(report, { production = false, now = new Date() } = {}) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  const levels = ['info', 'low', 'moderate', 'high', 'critical']
  if (
    !object(report) ||
    report.error ||
    !object(report.metadata?.vulnerabilities) ||
    !object(report.advisories)
  )
    throw new Error('Dependency audit did not return a complete advisory report')
  const counts = report.metadata.vulnerabilities
  if (levels.some((level) => !Number.isSafeInteger(counts[level]) || counts[level] < 0))
    throw new Error('Dependency audit returned invalid severity totals')
  const details = Object.values(report.advisories)
  for (const advisory of details) {
    if (
      !object(advisory) ||
      !levels.includes(advisory.severity) ||
      typeof advisory.module_name !== 'string' ||
      !advisory.module_name ||
      typeof advisory.github_advisory_id !== 'string' ||
      typeof advisory.patched_versions !== 'string'
    )
      throw new Error('Dependency audit returned an invalid advisory')
  }
  // Registry formats may count packages or advisories. Never accept a reported
  // severity without any matching details, or details with zero reported count.
  if (
    levels.some((level) => {
      const reported = counts[level] > 0
      const detailed = details.some((advisory) => advisory.severity === level)
      return reported !== detailed
    })
  )
    throw new Error('Dependency audit severity totals disagree with advisory details')
  return Object.values(report.advisories).filter((advisory) => {
    const allowed =
      !production &&
      advisory.module_name === 'braces' &&
      advisory.github_advisory_id === 'GHSA-vfj7-8cjw-p6xm' &&
      advisory.patched_versions === '<0.0.0' &&
      now < new Date('2026-11-19T00:00:00Z')
    return !allowed
  })
}

function check(directory, production) {
  const result = spawnSync('pnpm', ['audit', '--json', ...(production ? ['--prod'] : [])], {
    cwd: path.join(root, directory),
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error || result.signal || ![0, 1].includes(result.status))
    throw new Error(
      `Audit could not complete for ${directory}: ${result.error?.message || result.stderr}`,
    )
  const report = JSON.parse(result.stdout)
  const rejected = rejectedAdvisories(report, { production })
  for (const advisory of rejected)
    console.error(`${directory}: ${advisory.severity} ${advisory.module_name}: ${advisory.url}`)
  const accepted = Object.keys(report.advisories).length - rejected.length
  if (accepted)
    console.warn(
      `${directory}: ${accepted} time-limited dev-only braces exception; expires 2026-11-19`,
    )
  if (rejected.length) throw new Error(`Dependency audit rejected ${rejected.length} advisories`)
  console.log(`${directory}: ${production ? 'production' : 'full'} dependency audit passed`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    for (const directory of ['.', 'extension', '.github/release-please']) {
      check(directory, true)
      check(directory, false)
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
