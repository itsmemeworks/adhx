import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('released v2.1.2 database upgrade and rollback', () => {
  it('refuses direct runtime execution before opening an unapproved database', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-upgrade-guard-'))
    const database = path.join(directory, 'must-not-be-created.db')
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
          'scripts/verify-upgrade-runtime.ts',
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_PATH: database },
          timeout: 10_000,
        },
      )
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Run verify-upgrade.mjs instead')
      expect(fs.existsSync(database)).toBe(false)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('preserves synthetic released data, retries interrupted queues, and restores a consistent backup', () => {
    // The fixture is generated and checked by the full rehearsal from immutable
    // released migration code. This form also works in a shallow, offline CI checkout.
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'scripts/verify-upgrade.mjs'), '--schema-fixture'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 90_000 },
    )
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1)!)
    expect(report).toMatchObject({
      status: 'passed',
      source: 'verified release-schema fixture',
      release: 'f5d6b37d67df5354ad10e2c97fbf4291d9483094',
      accounts: 2,
      saves: 8,
      phoneReceipts: 4,
      retainedOriginals: 3,
    })
    expect(report.checks).toContain('backup restore and repeat upgrade')
    expect(report.checks).toContain('real queue retry/lease recovery')
  }, 90_000)
})
