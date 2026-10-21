/** Real application queue operations against the synthetic database created by verify-upgrade.mjs. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { sql } from 'drizzle-orm'

assert.equal(process.env.ADHX_UPGRADE_REHEARSAL, 'synthetic-only', 'Run verify-upgrade.mjs instead')
assert.ok(process.env.DATABASE_PATH)
const databaseDirectory = path.dirname(path.resolve(process.env.DATABASE_PATH))
assert.match(path.basename(databaseDirectory), /^adhx-upgrade-[A-Za-z0-9]+$/)
assert.equal(path.basename(process.env.DATABASE_PATH), 'synthetic.db')
assert.equal(process.env.MEDIA_DIR, path.join(databaseDirectory, 'media'))

let networkAttempts = 0
globalThis.fetch = async () => {
  networkAttempts++
  throw new Error('The upgrade rehearsal must never make network requests')
}

const { db } = await import('../src/lib/db')
const { SEMANTIC_MODEL_VERSION } = await import('../src/lib/semantic/config')
const { accountApproval } = await import('../src/lib/auth/account-state')
const { phoneCaller } = await import('../src/lib/api/phone-auth')
const { checkedLease, claimProcessingJob, failProcessingJob, heartbeat, ProcessingConflict } =
  await import('../src/lib/processing/jobs')
const { claimConversionJob, conversionHeartbeat, conversionFailure } =
  await import('../src/lib/processing/conversion')
const { startSaveQueue, queuedSave, savesInQueue } = await import('../src/lib/app/save-queue')

assert.equal(await accountApproval('owner'), 'approved')
assert.equal(await accountApproval('friend'), 'approved')
assert.equal(await accountApproval('missing'), null)
for (const [user, letter] of [
  ['owner', 'o'],
  ['friend', 'f'],
]) {
  const caller = await phoneCaller(
    new Request('https://example.invalid/api/app/doing', {
      headers: { authorization: `Bearer adhx_${letter.repeat(43)}` },
    }),
  )
  assert.equal(caller?.userId, user, 'Existing paired phone credentials remain usable')
  assert.equal(caller?.keyId, `phone-${user}`)
}
assert.equal(queuedSave('friend', 'phone-waiting'), null, 'Queue receipts stay account-scoped')
assert.equal(savesInQueue('owner'), 2)
assert.equal(savesInQueue('friend'), 0)
assert.throws(
  () => checkedLease('00000000-0000-4000-8000-000000000001', 'a'.repeat(43)),
  ProcessingConflict,
  'An old expired worker cannot submit results after upgrade',
)

const claimed = await claimProcessingJob('upgrade-rehearsal', SEMANTIC_MODEL_VERSION, 2, ['text'])
assert.ok(claimed)
assert.equal(claimed.kind, 'text')
assert.match(claimed.text ?? '', /expired-text/)
assert.notEqual(claimed.id, '00000000-0000-4000-8000-000000000001')
await heartbeat(claimed.id, claimed.lease)
await failProcessingJob(claimed.id, claimed.lease, 'retry', 'Synthetic worker restart')
const retried = db.all<{ attempts: number; next_attempt_at: string; last_error: string }>(
  sql`SELECT attempts,next_attempt_at,last_error FROM understanding_queue WHERE post_id='expired-text' AND kind='text'`,
)[0]
assert.equal(retried.attempts, 2, 'Existing retry count carries forward')
assert.ok(Date.parse(retried.next_attempt_at) > Date.now(), 'Retry respects backoff')
assert.equal(retried.last_error, 'Synthetic worker restart')
await assert.rejects(heartbeat(claimed.id, claimed.lease), ProcessingConflict)
assert.equal(
  db.all<{ id: string }>(sql`SELECT id FROM processing_leases WHERE post_id='active-text'`)[0]?.id,
  '00000000-0000-4000-8000-000000000002',
  'A still-valid pre-upgrade lease must not be stolen',
)
assert.equal(
  db.all<{ status: string }>(
    sql`SELECT status FROM post_embeddings WHERE post_id='failed-text' AND kind='text'`,
  )[0]?.status,
  'failed',
  'A terminal failure is preserved rather than silently marked successful',
)

const original = path.join(process.env.MEDIA_DIR!, 'twitter/video-expired/video-1.webm')
const originalBytes = readFileSync(original)
await assert.rejects(
  conversionHeartbeat('00000000-0000-4000-8000-000000000003', 'b'.repeat(43)),
  ProcessingConflict,
)
const conversion = await claimConversionJob('upgrade-rehearsal', SEMANTIC_MODEL_VERSION, 2)
assert.ok(conversion)
assert.equal(conversion.kind, 'convert')
assert.equal(
  db.all<{ attempts: number }>(
    sql`SELECT attempts FROM media_conversions WHERE post_id='video-expired'`,
  )[0]?.attempts,
  2,
  'Expired conversion lease consumes a bounded retry',
)
assert.equal(await conversionHeartbeat(conversion.id, conversion.lease), true)
assert.equal(
  await conversionFailure(conversion.id, conversion.lease, 'Synthetic converter restart'),
  true,
)
assert.deepEqual(
  db.all(sql`SELECT status,attempts FROM media_conversions WHERE post_id='video-expired'`)[0],
  { status: 'failed', attempts: 3 },
  'Repeated failed conversion terminates instead of looping forever',
)
assert.deepEqual(
  readFileSync(original),
  originalBytes,
  'Failure never deletes the retained original',
)
assert.equal(
  db.all<{ status: string }>(
    sql`SELECT status FROM media_conversions WHERE post_id='video-pending'`,
  )[0]?.status,
  'pending',
  'A future retry must not start early',
)

// Production startup recovery is intentionally disabled under NODE_ENV=test.
// Enable it only for this child process; every receipt is delayed and fetch is prohibited.
Object.assign(process.env, { NODE_ENV: 'development' })
startSaveQueue()
await setTimeout(30)
assert.equal(queuedSave('owner', 'phone-working')?.state, 'waiting')
assert.equal(queuedSave('owner', 'phone-failed')?.state, 'failed')
assert.equal(queuedSave('owner', 'phone-saved')?.state, 'saved')
assert.equal(savesInQueue('owner'), 2)
const state = (
  globalThis as typeof globalThis & {
    __adhxSaveQueue?: { timer: ReturnType<typeof setInterval> | null }
  }
).__adhxSaveQueue
if (state?.timer) clearInterval(state.timer)
assert.equal(networkAttempts, 0)
process.stdout.write(
  'UPGRADE_RUNTIME_OK: isolated account access, expired/active leases, retry backoff, bounded conversion failure, original preservation, phone restart recovery\n',
)
