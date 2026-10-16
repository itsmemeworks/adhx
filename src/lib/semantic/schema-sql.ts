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
`
