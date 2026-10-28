import { describe, expect, it } from 'vitest'
import { rejectedAdvisories } from '../../scripts/security/check-dependencies.mjs'

const advisory = {
  module_name: 'braces',
  github_advisory_id: 'GHSA-vfj7-8cjw-p6xm',
  patched_versions: '<0.0.0',
  severity: 'high',
}
const report = (value = advisory) => ({
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } },
  advisories: { one: value },
})
const now = new Date('2026-10-19T00:00:00Z')

describe('dependency advisory policy', () => {
  it('allows only the unpatched build-only advisory before its review deadline', () => {
    expect(rejectedAdvisories(report(), { now })).toEqual([])
  })
  it('never accepts the exception in production', () => {
    expect(rejectedAdvisories(report(), { production: true, now })).toHaveLength(1)
  })
  it('requires review at expiry, or when an upstream fix becomes available', () => {
    expect(rejectedAdvisories(report(), { now: new Date('2026-11-19') })).toHaveLength(1)
    expect(
      rejectedAdvisories(report({ ...advisory, patched_versions: '>=3.0.4' }), { now }),
    ).toHaveLength(1)
  })
  it('rejects a different advisory even on the same dependency', () => {
    expect(
      rejectedAdvisories(report({ ...advisory, github_advisory_id: 'different' }), { now }),
    ).toHaveLength(1)
  })
  it('fails closed on registry errors and incomplete reports', () => {
    expect(() => rejectedAdvisories({ error: 'registry unavailable' }, { now })).toThrow()
    expect(() => rejectedAdvisories({}, { now })).toThrow()
    expect(() => rejectedAdvisories({ ...report(), advisories: {} }, { now })).toThrow(
      'totals disagree',
    )
    expect(() => rejectedAdvisories({ ...report(), advisories: [] }, { now })).toThrow(
      'complete advisory',
    )
    expect(() =>
      rejectedAdvisories({ metadata: { vulnerabilities: { high: -1 } }, advisories: {} }, { now }),
    ).toThrow('severity totals')
  })

  describe('deepmerge through react-email', () => {
    const path = '.>react-email>@react-email/render>html-to-text>deepmerge'
    const deepmerge = {
      module_name: 'deepmerge',
      github_advisory_id: 'GHSA-gcqx-w48m-w2h4',
      patched_versions: '<0.0.0',
      severity: 'low',
      findings: [{ version: '4.3.1', paths: [path] }],
    }
    const low = (value: object) => ({
      metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0 } },
      advisories: { one: value },
    })

    it('accepts the unpatched advisory on its one known path, in production too', () => {
      expect(rejectedAdvisories(low(deepmerge), { now })).toEqual([])
      expect(rejectedAdvisories(low(deepmerge), { production: true, now })).toEqual([])
    })
    it('rejects it on any other path, or with no paths', () => {
      const elsewhere = {
        ...deepmerge,
        findings: [{ version: '4.3.1', paths: [path, '.>other>deepmerge'] }],
      }
      expect(rejectedAdvisories(low(elsewhere), { production: true, now })).toHaveLength(1)
      expect(rejectedAdvisories(low({ ...deepmerge, findings: [] }), { now })).toHaveLength(1)
      expect(rejectedAdvisories(low({ ...deepmerge, findings: undefined }), { now })).toHaveLength(
        1,
      )
    })
    it('requires review at expiry, or when a fix is released', () => {
      expect(rejectedAdvisories(low(deepmerge), { now: new Date('2026-12-31') })).toHaveLength(1)
      expect(
        rejectedAdvisories(low({ ...deepmerge, patched_versions: '>=4.3.2' }), { now }),
      ).toHaveLength(1)
    })
  })
})
