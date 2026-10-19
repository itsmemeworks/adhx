import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Keep the push paths-ignore list aligned. Unknown paths always require an image.
export const IMAGE_IGNORED_PATHS = ['*.md', 'docs/**', 'deploy/**', '.env.example', 'LICENSE']

export function hasImageChanges(paths) {
  return paths.some(
    (path) =>
      !(
        (!path.includes('/') && path.endsWith('.md')) ||
        path.startsWith('docs/') ||
        path.startsWith('deploy/') ||
        path === '.env.example' ||
        path === 'LICENSE'
      ),
  )
}

/** Only an ancestor whose intervening changes are documentation may advance main. */
export function mainImageEquivalent(sha, currentMain, cwd = process.cwd()) {
  if (![sha, currentMain].every((ref) => /^[a-f0-9]{40}$/.test(ref)))
    throw new Error('Expected immutable source and main SHAs')
  if (sha === currentMain) return true
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  try {
    git('merge-base', '--is-ancestor', sha, currentMain)
  } catch {
    return false
  }
  // Include both sides of renames: a runtime file moved into docs is a code change.
  const paths = git('diff', '--no-renames', '--name-only', '-z', sha, currentMain)
    .split('\0')
    .filter(Boolean)
  return !hasImageChanges(paths)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(mainImageEquivalent(process.argv[2], process.argv[3]))
