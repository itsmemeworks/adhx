const { isDeepStrictEqual } = require('node:util')

const RELEASE_BRANCH = 'release-please--branches--main'
const FILES = ['package.json', '.release-please-manifest.json', 'CHANGELOG.md']

function validateRelease({
  pr,
  files,
  basePackage,
  headPackage,
  baseManifest,
  headManifest,
  changelog,
}) {
  if (
    pr.user?.login !== 'github-actions[bot]' ||
    pr.head?.ref !== RELEASE_BRANCH ||
    pr.base?.ref !== 'main' ||
    pr.head?.repo?.full_name !== pr.base?.repo?.full_name
  )
    throw new Error('Not a trusted same-repository Release Please PR')
  if (
    files.length !== FILES.length ||
    new Set(files.map((f) => f.filename)).size !== FILES.length ||
    files.some((f) => f.status !== 'modified' || !FILES.includes(f.filename))
  ) {
    throw new Error('Release PR must modify only package.json, the manifest and CHANGELOG.md')
  }
  const { version: before, ...base } = basePackage
  const { version, ...head } = headPackage
  if (!isDeepStrictEqual(base, head))
    throw new Error('Release PR changes package settings or dependencies')
  const parse = (v) =>
    typeof v === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v)
      ? v.split('.').map(Number)
      : null
  const a = parse(before),
    b = parse(version)
  if (
    !a ||
    !b ||
    !(b[0] > a[0] || (b[0] === a[0] && (b[1] > a[1] || (b[1] === a[1] && b[2] > a[2]))))
  ) {
    throw new Error('Release version must advance to a stable semantic version')
  }
  if (
    Object.keys(baseManifest).length !== 1 ||
    baseManifest['.'] !== before ||
    !isDeepStrictEqual(headManifest, { '.': version })
  ) {
    throw new Error('Package and root release manifest versions must agree')
  }
  if (!changelog.includes(`## [${version}]`) && !changelog.includes(`## ${version}\n`)) {
    throw new Error('Changelog does not describe the new release')
  }
  return version
}

module.exports = { validateRelease, RELEASE_BRANCH }
