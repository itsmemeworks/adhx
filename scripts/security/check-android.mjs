import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

/** Query the actual resolved Maven graph, including transitive runtime libraries. */
export async function scanMavenDependencies(dependencies, request = fetch) {
  if (!Array.isArray(dependencies) || !dependencies.length || dependencies.length > 2000)
    throw new Error('Expected a non-empty resolved Android dependency manifest')
  const unique = new Map()
  for (const dependency of dependencies) {
    if (
      !/^[\w.\-]+:[\w.\-]+$/.test(dependency?.name) ||
      typeof dependency.version !== 'string' ||
      !/^\d[\w.\-+]*$/.test(dependency.version)
    )
      throw new Error('Expected resolved Maven coordinates and exact versions')
    unique.set(`${dependency.name}@${dependency.version}`, dependency)
  }
  const packages = [...unique.values()]
  const findings = []
  for (let start = 0; start < packages.length; start += 100) {
    const batch = packages.slice(start, start + 100)
    const response = await request('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: batch.map(({ name, version }) => ({
          package: { ecosystem: 'Maven', name },
          version,
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Android advisory lookup failed (${response.status})`)
    const report = await response.json()
    if (!Array.isArray(report.results) || report.results.length !== batch.length)
      throw new Error('Android advisory lookup returned incomplete results')
    for (const [index, result] of report.results.entries()) {
      if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result) ||
        Object.keys(result).some((key) => !['vulns', 'next_page_token'].includes(key)) ||
        result.next_page_token ||
        (result.vulns !== undefined && !Array.isArray(result.vulns))
      )
        throw new Error('Android advisory lookup requires a complete result')
      for (const vuln of result.vulns || []) {
        if (typeof vuln.id !== 'string' || vuln.id.length > 200)
          throw new Error('Android advisory lookup returned an invalid advisory')
        findings.push({ ...batch[index], advisory: vuln.id })
      }
    }
  }
  return { packages: packages.length, findings }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await scanMavenDependencies(JSON.parse(await readFile(process.argv[2], 'utf8')))
    console.log(`Checked ${result.packages} resolved Android runtime dependencies against OSV`)
    for (const finding of result.findings)
      console.error(
        `${finding.name}@${finding.version}: https://osv.dev/vulnerability/${encodeURIComponent(finding.advisory)}`,
      )
    if (result.findings.length) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
