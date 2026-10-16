/**
 * DDL for the understanding pipeline, shared by `migrate.ts` (runtime startup)
 * and the in-memory test database so the two can never drift.
 *
 * Both tables are keyed by the POST, not the saver. Only public post content
 * is understood (never tags, never who saved it), so one row serves everyone
 * who saved the same post. There is deliberately no `user_id`: per-user reads
 * join `bookmarks` on (platform, post_id), which is the isolation boundary.
 *
 * `post_embeddings.kind` is one of `text`, `image`, `video`. `status` is
 * `ok` (vector stored), `none` (the post has nothing of that kind) or
 * `failed` (gave up after retries; a changed `content_hash` retries it).
 *
 * `understanding_queue` is the durable work list. Higher `priority` runs
 * first (fresh saves and up-next posts jump the line), then oldest first.
 *
 * `auto_channels` is the one per-user table here: a user's saves grouped by
 * meaning and named ("Made for you"). Private, derived, recomputed when stale.
 *
 * `post_text_fts` is the keyword side of hybrid search: the same post text the
 * model reads (never tags), one row per post, written by the text job.
 */
export const UNDERSTANDING_DDL = `
  CREATE TABLE IF NOT EXISTS post_embeddings (
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    model TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    dims INTEGER NOT NULL DEFAULT 0,
    vector BLOB,
    status TEXT NOT NULL DEFAULT 'ok',
    error TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (platform, post_id, kind)
  );
  CREATE INDEX IF NOT EXISTS post_embeddings_status_idx ON post_embeddings(kind, status);
  CREATE INDEX IF NOT EXISTS post_embeddings_created_idx ON post_embeddings(created_at);

  CREATE TABLE IF NOT EXISTS understanding_queue (
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 10,
    attempts INTEGER NOT NULL DEFAULT 0,
    enqueued_at TEXT NOT NULL,
    next_attempt_at TEXT NOT NULL,
    last_error TEXT,
    PRIMARY KEY (platform, post_id, kind)
  );
  CREATE INDEX IF NOT EXISTS understanding_queue_next_idx ON understanding_queue(next_attempt_at, priority);

  CREATE TABLE IF NOT EXISTS auto_channels (
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    post_keys TEXT NOT NULL,
    size INTEGER NOT NULL,
    position INTEGER NOT NULL,
    model TEXT NOT NULL,
    saves_at_compute INTEGER NOT NULL,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, slug)
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS post_text_fts USING fts5(
    platform UNINDEXED,
    post_id UNINDEXED,
    body,
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3'
  );
`
