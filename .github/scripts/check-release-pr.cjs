const { validateRelease, RELEASE_BRANCH } = require('./release-validation.cjs')

module.exports = async ({ github, context, core }) => {
  const repo = context.repo
  const { data: prs } = await github.rest.pulls.list({
    ...repo,
    head: `${repo.owner}:${RELEASE_BRANCH}`,
    base: 'main',
    state: 'open',
  })
  for (const pr of prs) {
    let error
    let version
    try {
      const files = await github.paginate(github.rest.pulls.listFiles, {
        ...repo,
        pull_number: pr.number,
        per_page: 100,
      })
      async function jsonAt(path, ref) {
        const { data } = await github.rest.repos.getContent({
          ...repo,
          path,
          ref,
          request: { timeout: 15_000 },
        })
        if (data.type !== 'file' || data.encoding !== 'base64')
          throw new Error(`Cannot read ${path}`)
        return Buffer.from(data.content, 'base64').toString('utf8')
      }
      const [bp, hp, bm, hm, changelog] = await Promise.all([
        jsonAt('package.json', pr.base.sha),
        jsonAt('package.json', pr.head.sha),
        jsonAt('.release-please-manifest.json', pr.base.sha),
        jsonAt('.release-please-manifest.json', pr.head.sha),
        jsonAt('CHANGELOG.md', pr.head.sha),
      ])
      version = validateRelease({
        pr,
        files,
        basePackage: JSON.parse(bp),
        headPackage: JSON.parse(hp),
        baseManifest: JSON.parse(bm),
        headManifest: JSON.parse(hm),
        changelog,
      })
      const { data: fresh } = await github.rest.pulls.get({ ...repo, pull_number: pr.number })
      if (fresh.head.sha !== pr.head.sha || fresh.base.sha !== pr.base.sha)
        throw new Error('Release PR moved during validation; retry on its new revision')
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
    for (const name of ['build', 'format', 'test']) {
      await github.rest.checks.create({
        ...repo,
        name,
        head_sha: pr.head.sha,
        status: 'completed',
        conclusion: error ? 'failure' : 'success',
        output: {
          title: error
            ? 'Release metadata validation failed'
            : `Release ${version} metadata validated`,
          summary:
            error ||
            'Only version/changelog changes. Package settings, scripts and dependencies are unchanged; full application CI is covered by the protected base branch PRs.',
        },
      })
    }
    if (error) core.setFailed(error)
  }
}
