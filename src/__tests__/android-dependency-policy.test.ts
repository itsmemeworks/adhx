import { describe, expect, it, vi } from 'vitest'
import { scanMavenDependencies } from '../../scripts/security/check-android.mjs'

const dependency = { name: 'com.squareup.okhttp3:okhttp', version: '5.5.0' }
const response = (results: unknown[]) => new Response(JSON.stringify({ results }))

describe('resolved Android dependency audit', () => {
  it('checks exact transitive coordinates once, with a bounded HTTP request', async () => {
    const request = vi.fn<typeof fetch>(async () => response([{}]))
    expect(await scanMavenDependencies([dependency, dependency], request)).toEqual({
      packages: 1,
      findings: [],
    })
    const options = request.mock.calls[0]![1] as RequestInit
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(options.body)).queries).toEqual([
      { package: { ecosystem: 'Maven', name: dependency.name }, version: dependency.version },
    ])
  })
  it('reports every known vulnerability instead of treating a successful HTTP request as clean', async () => {
    const result = await scanMavenDependencies([dependency], async () =>
      response([{ vulns: [{ id: 'GHSA-test' }] }]),
    )
    expect(result.findings).toEqual([{ ...dependency, advisory: 'GHSA-test' }])
  })
  it('fails closed on HTTP errors, omitted results and incomplete pagination', async () => {
    await expect(
      scanMavenDependencies([dependency], async () => new Response('', { status: 503 })),
    ).rejects.toThrow('lookup failed')
    await expect(scanMavenDependencies([dependency], async () => response([]))).rejects.toThrow(
      'incomplete',
    )
    await expect(
      scanMavenDependencies([dependency], async () => response([{ next_page_token: 'more' }])),
    ).rejects.toThrow('complete result')
  })
  it('rejects empty manifests and unresolved version ranges', async () => {
    await expect(
      scanMavenDependencies([dependency], async () => response(['unexpected upstream error'])),
    ).rejects.toThrow('complete result')
    await expect(
      scanMavenDependencies([dependency], async () => response([{ error: 'unavailable' }])),
    ).rejects.toThrow('complete result')
    await expect(scanMavenDependencies([])).rejects.toThrow('non-empty')
    await expect(scanMavenDependencies([{ ...dependency, version: '[4,6)' }])).rejects.toThrow(
      'exact versions',
    )
  })
})
