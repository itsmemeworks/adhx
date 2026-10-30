import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { seenBy } from '@/lib/people/savers'
import type { DoingScope, DoingSummary } from './doing'

type Counts = Pick<DoingSummary, 'onTheirWay' | 'keeping' | 'learning' | 'needsYou' | 'ready'>
type Candidate = { platform: string; id: string; savedAt: string }

/** Count the complete visible backlog in SQLite. Hydration (post text, media,
 * faces, progress) is deliberately limited to the selected page afterwards. */
export function activityState(
  viewerId: string,
  scope: DoingScope,
  options: {
    now: number
    recentMs: number
    needsMs: number
    failedMs: number
    keeping: boolean
    diskFull: boolean
    remoteOffline: boolean
    limit: number
    summaryOnly: boolean
  },
): { summary: Counts; candidates: Candidate[] } {
  const { now } = options
  const iso = new Date(now).toISOString()
  const recent = new Date(now - options.recentMs).toISOString()
  const needs = new Date(now - options.needsMs).toISOString()
  const failed = new Date(now - options.failedMs).toISOString()
  const visible =
    scope === 'mine'
      ? sql`b.user_id = ${viewerId} AND COALESCE(b.source, '') != 'quoted'`
      : seenBy(viewerId, 'b')
  const cte = sql`WITH cand(platform, post_id) AS (
    SELECT platform, post_id FROM keep_jobs
      WHERE status IN ('pending','running','converting','failed')
        OR (status='unavailable' AND accepted_at IS NULL AND updated_at>=${needs})
        OR (status IN ('done','unavailable') AND updated_at>=${recent})
    UNION SELECT platform,post_id FROM understanding_queue
    UNION SELECT platform,post_id FROM media_conversions
      WHERE status IN ('pending','running','failed') OR updated_at>=${recent}
    UNION SELECT platform,post_id FROM post_embeddings WHERE status='failed' AND created_at>=${failed}
    UNION SELECT platform,post_id FROM post_extracted_text WHERE status='failed' AND created_at>=${failed}
    UNION SELECT platform,id FROM bookmarks WHERE processed_at>=${recent}
  ), visible AS (
    SELECT c.platform,c.post_id AS id,MAX(b.processed_at) AS savedAt,
      MAX(b.user_id = ${viewerId} AND COALESCE(b.source, '') != 'quoted') AS mine
    FROM cand c JOIN bookmarks b ON b.platform=c.platform AND b.id=c.post_id
    WHERE ${visible} GROUP BY c.platform,c.post_id
  ), queued AS (
    SELECT q.platform,q.post_id,COUNT(*) AS n,
      MAX(q.kind='speech') AS speech,MAX(q.kind='screen') AS screen,
      MAX(q.kind='speech' AND q.attempts>0 AND q.next_attempt_at>${iso}) AS speech_wait,
      MAX(q.kind='screen' AND q.attempts>0 AND q.next_attempt_at>${iso}) AS screen_wait,
      MAX(q.kind IN ('text','image','video') AND q.attempts>0 AND q.next_attempt_at>${iso}) AS learn_wait,
      MAX(q.kind='speech' AND l.id IS NOT NULL) AS speech_live,
      MAX(q.kind='screen' AND l.id IS NOT NULL) AS screen_live,
      MAX(q.kind IN ('text','image','video') AND l.id IS NOT NULL) AS learn_live
    FROM understanding_queue q LEFT JOIN processing_leases l
      ON l.platform=q.platform AND l.post_id=q.post_id AND l.kind=q.kind AND l.expires_at>${now}
    -- As in doing.ts: a words-only post's speech and screen jobs are skipped
    -- when the worker reaches them, so they don't keep it on its way.
    WHERE NOT (q.kind IN ('speech','screen') AND EXISTS (
      SELECT 1 FROM bookmarks wb WHERE wb.platform=q.platform AND wb.id=q.post_id
        AND COALESCE(wb.category,'tweet') IN ('text','tweet','article')))
    GROUP BY q.platform,q.post_id
  ), conversions AS (
    SELECT platform,post_id,MAX(status IN ('pending','running')) AS active,
      MAX(status='running') AS live,
      MAX(status='pending' AND attempts>0 AND next_attempt_at>${now}) AS waiting
    FROM media_conversions GROUP BY platform,post_id
  ), failed_learning AS (
    SELECT platform,post_id,MIN(CASE kind WHEN 'speech' THEN 4 WHEN 'screen' THEN 5 ELSE 6 END) AS step
    FROM (
      SELECT platform,post_id,kind FROM post_embeddings WHERE status='failed' AND created_at>=${failed}
      UNION ALL SELECT platform,post_id,kind FROM post_extracted_text WHERE status='failed' AND created_at>=${failed}
    ) GROUP BY platform,post_id
  ), facts AS (
    SELECT v.*,k.status AS keep_status,
      (k.status='unavailable' AND k.accepted_at IS NULL AND k.updated_at>=${needs}) AS keep_failed,
      (${options.keeping ? 1 : 0}=1 AND (k.status IN ('pending','running','failed') OR
        (k.platform IS NULL AND v.savedAt>=${recent}))) AS keep_active,
      (k.status='converting' OR COALESCE(c.active,0)) AS converting,
      COALESCE(c.live,0) AS conversion_live,COALESCE(c.waiting,0) AS conversion_wait,
      COALESCE(q.n,0) AS queued,
      CASE WHEN q.speech THEN 4 WHEN q.screen THEN 5 WHEN q.n>0 THEN 6 ELSE 7 END AS queue_step,
      CASE WHEN q.speech THEN q.speech_wait WHEN q.screen THEN q.screen_wait ELSE q.learn_wait END AS queue_wait,
      CASE WHEN q.speech THEN q.speech_live WHEN q.screen THEN q.screen_live ELSE q.learn_live END AS queue_live,
      f.step AS failed_step
    FROM visible v LEFT JOIN keep_jobs k ON k.platform=v.platform AND k.post_id=v.id
    LEFT JOIN queued q ON q.platform=v.platform AND q.post_id=v.id
    LEFT JOIN conversions c ON c.platform=v.platform AND c.post_id=v.id
    LEFT JOIN failed_learning f ON f.platform=v.platform AND f.post_id=v.id
  ), states AS (
    SELECT platform,id,savedAt,
      CASE WHEN keep_failed OR keep_active THEN 2 WHEN converting THEN 3
        WHEN queued>0 THEN queue_step WHEN failed_step IS NOT NULL AND mine THEN failed_step ELSE 7 END AS step,
      CASE
        WHEN keep_failed THEN 'needs_you'
        WHEN keep_active THEN CASE WHEN keep_status='failed' OR
          (COALESCE(keep_status,'')!='running' AND ${options.diskFull ? 1 : 0}=1) THEN 'waiting' ELSE 'working' END
        WHEN converting THEN CASE WHEN (${options.remoteOffline ? 1 : 0}=1 AND NOT conversion_live)
          OR conversion_wait THEN 'waiting' ELSE 'working' END
        WHEN queued>0 THEN CASE WHEN NOT COALESCE(queue_live,0) AND
          (queue_wait OR ${options.remoteOffline ? 1 : 0}=1) THEN 'waiting' ELSE 'working' END
        WHEN failed_step IS NOT NULL AND mine THEN 'needs_you' ELSE 'ready'
      END AS status
    -- Only the saver can do anything about a post that couldn't be kept.
    FROM facts WHERE mine OR NOT keep_failed
  )`
  const summary = db.get<Counts>(sql`${cte} SELECT
    COALESCE(SUM(status!='ready'),0) AS onTheirWay,
    COALESCE(SUM(status NOT IN ('ready','needs_you') AND step<=3),0) AS keeping,
    COALESCE(SUM(status NOT IN ('ready','needs_you') AND step>=4),0) AS learning,
    COALESCE(SUM(status='needs_you'),0) AS needsYou,
    COALESCE(SUM(status='ready'),0) AS ready FROM states`)!
  const candidates = options.summaryOnly
    ? []
    : db.all<Candidate>(sql`${cte}
    SELECT platform,id,savedAt FROM states ${scope === 'needs' ? sql`WHERE status='needs_you'` : sql``}
    ORDER BY CASE status WHEN 'needs_you' THEN 0 WHEN 'working' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,
      savedAt DESC,platform,id LIMIT ${options.limit}`)
  return { summary, candidates }
}
