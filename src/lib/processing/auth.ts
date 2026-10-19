import { timingSafeEqual } from 'node:crypto'
import { remoteProcessing } from './config'

/** A machine credential distinct from accounts, sessions and phone keys. */
export function workerAuthorized(request: Request): boolean {
  const expected = process.env['PROCESSING_WORKER_TOKEN'] || ''
  const supplied =
    request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1] || ''
  if (
    !remoteProcessing() ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(expected) ||
    supplied.length !== expected.length
  )
    return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}
export function workerHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store' }
}
