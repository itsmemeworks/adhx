import {
  EXTRACT_KINDS,
  KINDS,
  extractEnabled,
  type ExtractKind,
  type JobKind,
} from '@/lib/semantic/config'
import type { IndexingLevel, VideoPlan } from './profiles'

/**
 * The native worker protocol. Version 2 adds speech and on-screen text jobs
 * (`kind: 'speech' | 'screen'`, finished with `extracted`) and an optional
 * `kinds` list on `claim`, so a worker can say what it is able to do. The
 * server still speaks version 1: a version-1 worker is only ever handed
 * text, image, video and conversion jobs, so it never sees a kind it
 * doesn't know.
 */
export const PROCESSING_PROTOCOL = 2
export const SUPPORTED_PROTOCOLS: readonly number[] = [1, 2]

export function supportedProtocol(protocol: unknown): protocol is number {
  return typeof protocol === 'number' && SUPPORTED_PROTOCOLS.includes(protocol)
}

/**
 * The understanding kinds a worker may be handed: what its protocol knows,
 * narrowed to what it advertised, minus anything switched off on the server.
 */
export function claimableKinds(protocol: number, advertised?: unknown): JobKind[] {
  const known: JobKind[] =
    protocol >= 2 ? [...KINDS, ...EXTRACT_KINDS.filter(extractEnabled)] : [...KINDS]
  if (protocol < 2 || !Array.isArray(advertised)) return known
  return known.filter((kind) => advertised.includes(kind))
}

export interface VideoProgress {
  plan: VideoPlan
  nextSegment: number
}
export interface ProcessingMedia {
  path: string
  mime: string
  bytes: number
  /** Opaque retained-file generation; shared by speech, OCR and vision. Optional for older servers. */
  cacheKey?: string
}
export interface ProcessingJob {
  id: string
  lease: string
  model: string
  kind: JobKind | 'convert'
  contentHash: string
  profile: IndexingLevel
  text?: string
  media?: ProcessingMedia
  /**
   * Protocol 2, `screen` jobs: every retained file to read, each with its
   * slot (`photo-N` pictures and `video-1`, whose frames are sampled).
   */
  files?: (ProcessingMedia & { slot: string })[]
  /** Protocol 2, `screen` jobs: the video's length when known. */
  videoSeconds?: number | null
  video?: VideoProgress
  conversion?: { width: number; height: number; duration: number; hasAudio: boolean }
}
export type ProcessingRequest =
  | {
      action: 'claim'
      workerId: string
      model: string
      protocol: number
      kinds?: string[]
      cachedMedia?: string[]
    }
  | { action: 'heartbeat'; id: string; lease: string }
  | { action: 'plan'; id: string; lease: string; duration: number }
  | { action: 'complete'; id: string; lease: string; vector: number[] }
  | { action: 'segment'; id: string; lease: string; index: number; vector: number[] }
  | {
      action: 'extracted'
      id: string
      lease: string
      /** The cleaned words, or null when there was nothing to keep (silence, no text). */
      text: string | null
      language?: string | null
    }
  | { action: 'fail'; id: string; lease: string; code: 'retry' | 'none'; error: string }

export type { ExtractKind }
