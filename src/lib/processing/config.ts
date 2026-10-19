import { isIndexingLevel, VIDEO_PLAN_VERSION, type IndexingLevel } from './profiles'

export function remoteProcessing(): boolean {
  return process.env['PROCESSING_MODE'] === 'remote'
}
export function indexingPaused(): boolean {
  return ['off', '0', 'false'].includes(process.env['SEMANTIC_SEARCH'] || '')
}
export function indexingLevel(): IndexingLevel {
  const value = process.env['INDEXING_LEVEL'] || 'normal'
  if (!isIndexingLevel(value)) throw new Error('INDEXING_LEVEL must be light, normal or deep')
  return value
}
export function remoteVideoPrefix(): string {
  return `${VIDEO_PLAN_VERSION}/${indexingLevel()}|`
}
export function videoResultCurrent(contentHash: string): boolean {
  return !remoteProcessing() || !contentHash || contentHash.startsWith(remoteVideoPrefix())
}
