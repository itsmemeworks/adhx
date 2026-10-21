import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { JobActivity } from '@/lib/semantic/supervisor'

/** A worker's current post is visible only to someone who has saved it. */
export function remoteActivity(userId: string): JobActivity | null {
  const [row] = db.all<{
    platform: string
    post_id: string
    kind: JobActivity['kind']
    expires_at: number
    segments: number | null
    next_segment: number | null
    frames_per_segment: number | null
  }>(sql`
    SELECT l.platform,l.post_id,l.kind,l.expires_at,v.segments,v.next_segment,v.frames_per_segment
    FROM processing_leases l
    LEFT JOIN video_index_state v ON v.platform=l.platform AND v.post_id=l.post_id AND v.content_hash=l.content_hash
    WHERE l.expires_at>${Date.now()} AND EXISTS(SELECT 1 FROM bookmarks b WHERE b.platform=l.platform AND b.id=l.post_id AND b.user_id=${userId})
    ORDER BY l.expires_at DESC LIMIT 1`)
  if (!row) return null
  return {
    platform: row.platform,
    postId: row.post_id,
    kind: row.kind,
    phase: 'remote',
    frames: row.frames_per_segment ?? 0,
    startedAt: new Date(row.expires_at - 120_000).toISOString(),
    ...(row.segments ? { segments: row.segments, completedSegments: row.next_segment ?? 0 } : {}),
  }
}
