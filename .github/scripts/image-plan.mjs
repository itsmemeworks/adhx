import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function normalizeVersion(raw) {
  const version = raw.replace(/^v/, '')
  if (
    version &&
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)
  ) {
    throw new Error('Expected a semantic release version')
  }
  return version
}

export function imagePlan({ sha, repository, version = '', latestRelease }) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected an immutable commit SHA')
  version = normalizeVersion(version)
  if (!version) throw new Error('A tagged release version is required')
  const image = `ghcr.io/${repository.toLowerCase()}`
  const tags = [`${image}:sha-${sha}`]
  if (version) {
    tags.push(`${image}:${version}`)
    if (!version.includes('-') && version === normalizeVersion(latestRelease || '')) {
      const [major, minor] = version.split('.')
      tags.push(`${image}:${major}.${minor}`, `${image}:${major}`, `${image}:latest`)
    }
  }
  return { image, sha, version, tags }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = normalizeVersion(process.env.RAW_VERSION || '')
  if (!version) throw new Error('A tagged release version is required')
  if (process.env.GITHUB_REF !== 'refs/heads/main')
    throw new Error('Release images may only be published from main')
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  if (version) {
    git('fetch', '--no-tags', 'origin', `refs/tags/v${version}`)
    git('checkout', '--detach', 'FETCH_HEAD')
    git('merge-base', '--is-ancestor', 'HEAD', 'origin/main')
    if (JSON.parse(readFileSync('package.json', 'utf8')).version !== version)
      throw new Error('Release tag and package version disagree')
  }
  const plan = imagePlan({
    sha: git('rev-parse', 'HEAD'),
    repository: process.env.GITHUB_REPOSITORY,
    version,
  })
  for (const [key, value] of Object.entries({
    sha: plan.sha,
    image: plan.image,
    version,
    package_version: JSON.parse(readFileSync('package.json', 'utf8')).version,
  }))
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}
