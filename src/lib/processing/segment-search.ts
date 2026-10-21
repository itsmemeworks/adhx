import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { SEMANTIC_DIMS, SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'
import { cosine, fromBlob } from '@/lib/semantic/vectors'
import { indexingLevel, remoteProcessing, remoteVideoPrefix } from './config'

export interface SegmentScore {
  /** Best projected similarity, used for candidate selection/distribution. */
  score: number
  /** Best full-vector similarity; it may come from a different segment. */
  fullScore: number
}

const PAGE_SIZE = 1_000

/**
 * A post gets one vote, its best temporal segment, regardless of video length.
 * Page vectors rather than retaining the segment corpus in the NAS web process.
 * The allow-set comes from the existing search/account scope; downstream search
 * still applies moderation and builds the visible result with its usual rules.
 */
export async function segmentScores(
  query: Float32Array,
  project: (vector: Float32Array) => Float32Array,
  allow?: ReadonlySet<string>,
): Promise<Map<string, SegmentScore>> {
  const scores = new Map<string, SegmentScore>()
  if (!remoteProcessing() || allow?.size === 0) return scores
  const projectedQuery = project(query)
  const prefix = remoteVideoPrefix()
  let after = 0
  for (;;) {
    const rows = db.all<{
      rowid: number
      platform: string
      post_id: string
      vector: Buffer
    }>(sql`
      SELECT s.rowid, s.platform, s.post_id, s.vector
      FROM video_segments s
      JOIN video_index_state state
        ON state.platform = s.platform AND state.post_id = s.post_id
        AND state.content_hash = s.content_hash AND state.model = s.model
      WHERE s.rowid > ${after} AND s.model = ${SEMANTIC_MODEL_VERSION}
        AND state.profile = ${indexingLevel()}
        AND substr(state.content_hash, 1, ${prefix.length}) = ${prefix}
        AND s.segment_index >= 0 AND s.segment_index < state.next_segment
        AND s.segment_index < state.segments
      ORDER BY s.rowid LIMIT ${PAGE_SIZE}
    `)
    for (const row of rows) {
      after = row.rowid
      const key = `${row.platform}:${row.post_id}`
      if (allow && !allow.has(key)) continue
      const vector = fromBlob(row.vector)
      if (!vector || vector.length !== SEMANTIC_DIMS) continue
      const score = cosine(projectedQuery, project(vector))
      const fullScore = cosine(query, vector)
      if (!Number.isFinite(score) || !Number.isFinite(fullScore)) continue
      const current = scores.get(key)
      scores.set(key, {
        score: Math.max(current?.score ?? -Infinity, score),
        fullScore: Math.max(current?.fullScore ?? -Infinity, fullScore),
      })
    }
    if (rows.length < PAGE_SIZE) return scores
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}
