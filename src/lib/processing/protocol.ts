import type { UnderstandingKind } from '@/lib/semantic/config'
import type { IndexingLevel, VideoPlan } from './profiles'

export const PROCESSING_PROTOCOL = 1
export interface VideoProgress {
  plan: VideoPlan
  nextSegment: number
}
export interface ProcessingJob {
  id: string
  lease: string
  model: string
  kind: UnderstandingKind | 'convert'
  contentHash: string
  profile: IndexingLevel
  text?: string
  media?: { path: string; mime: string; bytes: number }
  video?: VideoProgress
  conversion?: { width: number; height: number; duration: number; hasAudio: boolean }
}
export type ProcessingRequest =
  | { action: 'claim'; workerId: string; model: string; protocol: number }
  | { action: 'heartbeat'; id: string; lease: string }
  | { action: 'plan'; id: string; lease: string; duration: number }
  | { action: 'complete'; id: string; lease: string; vector: number[] }
  | { action: 'segment'; id: string; lease: string; index: number; vector: number[] }
  | { action: 'fail'; id: string; lease: string; code: 'retry' | 'none'; error: string }
