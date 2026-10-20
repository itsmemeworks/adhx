import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'
import { supportedProtocol } from './protocol'
import { claimConversionJob } from './conversion'
import { claimProcessingJob, ProcessingConflict, ProcessingInputError } from './jobs'
import { indexingPaused } from './config'

/** Durable alternating service classes: keep playback useful without making a
 * cold conversion import block every understanding job. The first claim favors
 * understanding; empty classes immediately yield their turn. */
export async function claimNextJob(
  workerId: string,
  model: string,
  protocol: number,
  kinds?: unknown,
  onRelease?: (keys: string[]) => void,
) {
  if (model !== SEMANTIC_MODEL_VERSION || !supportedProtocol(protocol))
    throw new ProcessingConflict('Worker model or protocol does not match server')
  if (typeof workerId !== 'string' || !/^[A-Za-z0-9._ -]{1,80}$/.test(workerId))
    throw new ProcessingInputError('Invalid worker name')
  if (kinds !== undefined && !Array.isArray(kinds))
    throw new ProcessingInputError('Invalid worker kinds')
  // Reserve the turn synchronously before any asynchronous content load. Two
  // concurrent workers must not both read the same previous service class.
  const preferred = runInTransaction(() => {
    const last = db.all<{ value: string }>(
      sql`SELECT value FROM server_settings WHERE key='processing.lastClass'`,
    )[0]?.value
    const next = last === 'understanding' ? 'conversion' : 'understanding'
    db.run(sql`INSERT INTO server_settings(key,value,updated_at) VALUES('processing.lastClass',${next},${new Date().toISOString()})
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    return next
  })
  const conversion = () => claimConversionJob(workerId, model, protocol)
  const understanding = () =>
    indexingPaused()
      ? Promise.resolve(null)
      : claimProcessingJob(workerId, model, protocol, kinds, onRelease)
  return preferred === 'conversion'
    ? ((await conversion()) ?? (await understanding()))
    : ((await understanding()) ?? (await conversion()))
}
