import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const directories: string[] = []

function install({ ready = false, failUpdate = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'adhx-ci-media-'))
  directories.push(directory)
  const bin = join(directory, 'bin')
  mkdirSync(bin)
  const source = join(directory, 'ubuntu.sources')
  const original =
    'URIs: http://azure.archive.ubuntu.com/ubuntu/\nURIs: http://security.ubuntu.com/ubuntu/\n'
  writeFileSync(source, original)
  for (const command of ['ffmpeg', 'ffprobe']) {
    writeFileSync(
      join(bin, command),
      '#!/bin/bash\n[[ "$MEDIA_READY" == true || -f "$TEST_DIR/installed" ]]\n',
      { mode: 0o755 },
    )
  }
  // Never invoke sudo/APT during this test. Execute the real installer with
  // stand-in tools to check source isolation, install arguments and failures.
  writeFileSync(
    join(bin, 'sudo'),
    `#!/bin/bash
printf '%s\\n' "$*" >> "$TEST_DIR/calls"
for argument in "$@"; do
  if [[ "$argument" == Dir::Etc::sourcelist=* ]]; then
    cat "\${argument#*=}" > "$TEST_DIR/used.sources"
  fi
done
if [[ "\${*: -1}" == update && "$FAIL_UPDATE" == true ]]; then exit 42; fi
if [[ " $* " == *' install '* ]]; then touch "$TEST_DIR/installed"; fi
`,
    { mode: 0o755 },
  )
  const result = spawnSync('bash', [resolve('scripts/ci/install-media-tools.sh')], {
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      XDG_CACHE_HOME: join(directory, 'cache'),
      ADHX_APT_SOURCES: source,
      TEST_DIR: directory,
      MEDIA_READY: String(ready),
      FAIL_UPDATE: String(failUpdate),
    },
  })
  return {
    result,
    source: readFileSync(source, 'utf8'),
    original,
    read: (name: string) => readFileSync(join(directory, name), 'utf8'),
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Ubuntu CI media installer', () => {
  it('uses working runner tools without invoking a privileged package install', () => {
    const run = install({ ready: true })
    expect(run.result.status, run.result.stderr).toBe(0)
    expect(run.result.stdout).toContain('Using the runner media tools.')
    expect(() => run.read('calls')).toThrow()
  })

  it('isolates HTTPS sources and retains version-checked downloads with bounded network waits', () => {
    const run = install()
    expect(run.result.status, run.result.stderr).toBe(0)
    expect(run.source).toBe(run.original)
    expect(run.read('used.sources')).toBe(
      'URIs: https://archive.ubuntu.com/ubuntu/\nURIs: https://security.ubuntu.com/ubuntu/\n',
    )
    const calls = run.read('calls').trim().split('\n')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatch(/ update$/)
    expect(calls[1]).toContain('install --no-install-recommends -y ffmpeg')
    expect(calls[0]).toContain('Dir::Cache::archives=')
    expect(calls[0]).toContain('Keep-Downloaded-Packages=true')
    expect(calls[0]).toContain('Acquire::Retries=2')
    expect(calls[0]).toContain('Acquire::https::Timeout=20')
    expect(calls[0]).toContain('APT::Update::Error-Mode=any')
  })

  it('fails closed when package metadata cannot be refreshed instead of installing from stale lists', () => {
    const run = install({ failUpdate: true })
    expect(run.result.status).toBe(42)
    expect(run.read('calls')).not.toContain(' install ')
    expect(run.source).toBe(run.original)
  })
})
