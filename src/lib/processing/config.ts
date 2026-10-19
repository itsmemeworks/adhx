import { isIndexingLevel, VIDEO_PLAN_VERSION, type IndexingLevel } from './profiles'

export function remoteProcessing(): boolean {
  const mode = process.env['PROCESSING_MODE'] || 'local'
  if (mode !== 'local' && mode !== 'remote')
    throw new Error('PROCESSING_MODE must be local or remote')
  return mode === 'remote'
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
