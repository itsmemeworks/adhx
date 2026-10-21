/** A disposable real runner with a deliberately stalled model, for SIGKILL testing. */
export {}
const [serverUrl, databasePath, cacheDir] = process.argv.slice(2)
if (!serverUrl || !databasePath || !cacheDir) throw new Error('Missing isolated runner paths')
process.env['DATABASE_PATH'] = databasePath
process.env['MEDIA_DIR'] = `${cacheDir}/unused-media`
process.env['SEMANTIC_SPEECH'] = 'off'
process.env['SEMANTIC_SCREEN_TEXT'] = 'off'
process.env['SEMANTIC_THREADS'] = '1'
const { createMacRunner } = await import('../src/lib/processing/mac-runner')
const runner = createMacRunner(
  {
    serverUrl,
    token: 'p'.repeat(43),
    workerId: 'disposable-kill-test',
    cacheDir,
    maxFileBytes: 1024 ** 2,
    maxCacheBytes: 128 * 1024 ** 2,
    pollMs: 1000,
  },
  {
    async fetch(input, init) {
      const response = await fetch(input, init)
      if (
        String(input).endsWith('/api/processing/jobs') &&
        typeof init?.body === 'string' &&
        JSON.parse(init.body).action === 'claim'
      ) {
        const { job } = await response.clone().json()
        if (job) process.stdout.write(`CLAIM ${JSON.stringify({ id: job.id, lease: job.lease })}\n`)
      }
      return response
    },
    processor: {
      async run() {
        process.stdout.write('MODEL_STARTED\n')
        // This exercises a runner killed during work, without loading a model or
        // claiming that a synthetic vector measures inference performance.
        return new Promise<number[]>(() => {})
      },
      close() {},
    },
    log() {},
  },
)
await runner.run()
