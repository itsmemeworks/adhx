// Render the retained scanner report without another image build or scan.
import { existsSync, readFileSync } from 'node:fs'

for (const file of process.argv.slice(2)) {
  if (!existsSync(file)) continue
  const report = JSON.parse(readFileSync(file, 'utf8'))
  for (const result of report.Results ?? []) {
    for (const finding of result.Vulnerabilities ?? []) {
      console.log(
        JSON.stringify({
          report: file,
          target: result.Target,
          id: finding.VulnerabilityID,
          package: finding.PkgName,
          path: finding.PkgPath,
          installed: finding.InstalledVersion,
          fixed: finding.FixedVersion,
          severity: finding.Severity,
        }),
      )
    }
  }
}
