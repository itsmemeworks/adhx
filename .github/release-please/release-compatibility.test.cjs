const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const { Manifest } = require('release-please/build/src/manifest')
const { buildStrategy } = require('release-please/build/src/factory')
const { Merge } = require('release-please/build/src/plugins/merge')
const { parseConventionalCommits } = require('release-please/build/src/commit')
const { TagName } = require('release-please/build/src/util/tag-name')
const { setLogger } = require('release-please/build/src/util/logger')

const root = resolve(__dirname, '../..')
const config = JSON.parse(readFileSync(resolve(root, 'release-please-config.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const warnings = []
const logger = {
  info() {},
  debug() {},
  trace() {},
  error() {},
  warn(message) {
    warnings.push(message)
  },
}
setLogger(logger)
const releasedSha = '1'.repeat(40)
const mergedSha = '2'.repeat(40)

async function strategyFor(configuration) {
  // Only repository reads are implemented. No token, GitHub client, release
  // creation, tag writes or network calls are used by these real upstream methods.
  const github = {
    repository: { owner: 'owner', repo: 'app' },
    async getFileJson(file) {
      if (file === 'release-please-config.json') return configuration
      if (file === '.release-please-manifest.json') return { '.': '2.0.1' }
      throw Error(`Unexpected repository JSON read: ${file}`)
    },
    async getFileContentsOnBranch(file) {
      assert.equal(file, 'package.json')
      const content = JSON.stringify(pkg)
      return { content: Buffer.from(content).toString('base64'), parsedContent: content }
    },
  }
  const manifest = await Manifest.fromManifest(github, 'main')
  const options = manifest.repositoryConfig['.']
  const strategy = await buildStrategy({ ...options, github, targetBranch: 'main', logger })
  return { github, strategy, options, manifest }
}

async function roundTrip(configuration, message = 'feat: add a useful feature') {
  const { github, strategy, options, manifest } = await strategyFor(configuration)
  const previous = { tag: TagName.parse('v2.0.1'), sha: releasedSha, notes: 'Previous release' }
  const commits = parseConventionalCommits([
    { sha: '3'.repeat(40), message, files: ['src/app/page.tsx'] },
  ])
  const candidate = await strategy.buildReleasePullRequest(commits, previous, false, [
    'autorelease: pending',
  ])
  if (!candidate) return { strategy, candidate }
  // Manifest mode always merges the single root candidate into the grouped
  // branch/body too. Omitting this real plugin would miss the production bug.
  const [grouped] = await new Merge(github, 'main', manifest.repositoryConfig).run([
    { path: '.', pullRequest: candidate, config: options },
  ])
  const merged = {
    number: 1,
    title: grouped.pullRequest.title.toString(),
    body: grouped.pullRequest.body.toString(),
    headBranchName: grouped.pullRequest.headRefName,
    baseBranchName: 'main',
    sha: mergedSha,
    labels: ['autorelease: pending'],
    files: [],
  }
  const release = await strategy.buildRelease(merged)
  return { strategy, candidate, grouped, merged, release }
}

test('the pinned action and test library use the same release-please implementation', () => {
  assert.equal(require('release-please/package.json').version, '17.6.0')
  const workflow = readFileSync(resolve(root, '.github/workflows/release-please.yml'), 'utf8')
  assert.match(
    workflow,
    /googleapis\/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7\b/,
  )
})

test('reproduces the empty-component fallback that prevented a grouped root release', async () => {
  const old = structuredClone(config)
  delete old.packages['.']['package-name']
  const result = await roundTrip(old)
  assert.equal(await result.strategy.getBranchComponent(), pkg.name)
  assert.equal(result.merged.headBranchName, 'release-please--branches--main')
  assert.match(result.merged.body, /<summary>2\.1\.0<\/summary>/)
  assert.equal(result.release, undefined)
  assert.ok(
    warnings.some((message) =>
      message.includes(`does not match configured component: ${pkg.name}`),
    ),
  )
})

test('round-trips a grouped PR into a plain release tag at the exact merged revision', async () => {
  const result = await roundTrip(config)
  assert.equal(await result.strategy.getBranchComponent(), '')
  assert.equal(result.merged.title, 'chore: release main')
  assert.equal(result.merged.headBranchName, 'release-please--branches--main')
  assert.equal(result.release.tag.toString(), 'v2.1.0')
  assert.equal(result.release.name, 'v2.1.0')
  assert.equal(result.release.sha, mergedSha)
  assert.match(result.release.notes, /add a useful feature/)
  const update = result.candidate.updates.find((change) => change.path === 'package.json')
  const updated = JSON.parse(
    update.updater.updateContent(JSON.stringify({ ...pkg, version: '2.0.1' })),
  )
  assert.equal(
    updated.name,
    pkg.name,
    'The release-only override must not rename the application package',
  )
  assert.equal(updated.version, '2.1.0')
})

test('patch releases round-trip through the same branch and tag convention', async () => {
  const result = await roundTrip(config, 'fix: correct a save regression')
  assert.equal(result.release.tag.toString(), 'v2.0.2')
  assert.equal(result.release.sha, mergedSha)
})

test('documentation-only changes still do not create a release candidate', async () => {
  const result = await roundTrip(config, 'docs: clarify setup')
  assert.equal(result.candidate, undefined)
})

test('an unrelated component branch cannot be interpreted as the root release', async () => {
  const result = await roundTrip(config)
  assert.equal(
    await result.strategy.buildRelease({
      ...result.merged,
      headBranchName: 'release-please--branches--main--components--other',
    }),
    undefined,
  )
})
