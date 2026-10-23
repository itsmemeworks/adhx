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
 * `group_channels` is the same for the whole server ("From everyone"): every
 * member's visible saves grouped and named. No `user_id`; reads re-check each
 * post's visible savers.
 *
 * `post_text_fts` is the keyword side of hybrid search: the same post text the
 * model reads (never tags), one row per post, written on save independently
 * of the model. A model-free startup pass fills any missing rows.
 *
 * `post_extracted_text` holds words read out of a post's media on this
 * server: `speech` (what is said in its video or sound) and `screen` (text in
 * its pictures or video frames). Keyed by post like `post_embeddings`; `model`
 * is the extractor version, `status` is `ok` (words kept), `none` (nothing
 * worth keeping: silence, music, no text) or `failed`. The words join the
 * post's text document and keyword row.
 *
 * Everything here that is about one post (its vectors, queue rows, keyword
 * row and extracted words) is removed with the post's last save, by the
 * triggers below, whichever way the save is deleted.
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

  CREATE TABLE IF NOT EXISTS group_channels (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    post_keys TEXT NOT NULL,
    savers TEXT NOT NULL,
    position INTEGER NOT NULL,
    saves_at_compute INTEGER NOT NULL,
    computed_at TEXT NOT NULL,
    model_version TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS post_text_fts USING fts5(
    platform UNINDEXED,
    post_id UNINDEXED,
    body,
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3'
  );

  CREATE TABLE IF NOT EXISTS post_text_keys (
    row_id INTEGER PRIMARY KEY,
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS post_text_keys_post_idx ON post_text_keys(platform, post_id);

  CREATE TABLE IF NOT EXISTS post_extracted_text (
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    model TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    text TEXT,
    language TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (platform, post_id, kind)
  );

  CREATE TRIGGER IF NOT EXISTS extracted_text_last_save_deleted
  AFTER DELETE ON bookmarks
  WHEN NOT EXISTS (SELECT 1 FROM bookmarks WHERE platform=OLD.platform AND id=OLD.id)
  BEGIN
    DELETE FROM post_extracted_text WHERE platform=OLD.platform AND post_id=OLD.id;
  END;

  DROP TRIGGER IF EXISTS understanding_last_save_deleted;
  CREATE TRIGGER understanding_last_save_deleted
  AFTER DELETE ON bookmarks
  WHEN NOT EXISTS (SELECT 1 FROM bookmarks WHERE platform=OLD.platform AND id=OLD.id)
  BEGIN
    DELETE FROM post_embeddings WHERE platform=OLD.platform AND post_id=OLD.id;
    DELETE FROM understanding_queue WHERE platform=OLD.platform AND post_id=OLD.id;
    DELETE FROM post_text_fts WHERE rowid IN (
      SELECT row_id FROM post_text_keys WHERE platform=OLD.platform AND post_id=OLD.id
    );
    DELETE FROM post_text_keys WHERE platform=OLD.platform AND post_id=OLD.id;
  END;

  CREATE TABLE IF NOT EXISTS processing_leases (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    lease_hash TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    content_hash TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    profile TEXT NOT NULL,
    media_slot TEXT,
    generation_hash TEXT NOT NULL,
    UNIQUE(platform, post_id, kind)
  );
  CREATE INDEX IF NOT EXISTS processing_leases_expiry ON processing_leases(expires_at);
  CREATE TABLE IF NOT EXISTS video_index_state (
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    profile TEXT NOT NULL,
    duration REAL NOT NULL,
    segments INTEGER NOT NULL,
    frames_per_segment INTEGER NOT NULL,
    next_segment INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(platform, post_id)
  );
  CREATE TABLE IF NOT EXISTS video_segments (
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    segment_index INTEGER NOT NULL,
    start_seconds REAL NOT NULL,
    end_seconds REAL NOT NULL,
    vector BLOB NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(platform, post_id, segment_index)
  );
  CREATE INDEX IF NOT EXISTS video_segments_changed ON video_segments(created_at);

  CREATE TABLE IF NOT EXISTS media_conversions (
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    source_path TEXT NOT NULL,
    source_bytes INTEGER NOT NULL,
    source_created_at TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    has_audio INTEGER NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    lease_id TEXT UNIQUE,
    lease_hash TEXT,
    worker_id TEXT,
    expires_at INTEGER,
    model TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(platform, post_id, slot)
  );
  CREATE INDEX IF NOT EXISTS media_conversions_due ON media_conversions(status,next_attempt_at,expires_at);

  CREATE TRIGGER IF NOT EXISTS conversion_last_save_deleted
  AFTER DELETE ON bookmarks
  WHEN NOT EXISTS (SELECT 1 FROM bookmarks WHERE platform=OLD.platform AND id=OLD.id)
  BEGIN
    DELETE FROM media_conversions WHERE platform=OLD.platform AND post_id=OLD.id;
  END;

  CREATE TRIGGER IF NOT EXISTS processing_last_save_deleted
  AFTER DELETE ON bookmarks
  WHEN NOT EXISTS (SELECT 1 FROM bookmarks WHERE platform=OLD.platform AND id=OLD.id)
  BEGIN
    DELETE FROM processing_leases WHERE platform=OLD.platform AND post_id=OLD.id;
    DELETE FROM post_embeddings WHERE platform=OLD.platform AND post_id=OLD.id AND kind='video'
      AND EXISTS (SELECT 1 FROM video_index_state WHERE platform=OLD.platform AND post_id=OLD.id);
    DELETE FROM video_segments WHERE platform=OLD.platform AND post_id=OLD.id;
    DELETE FROM video_index_state WHERE platform=OLD.platform AND post_id=OLD.id;
  END;
`
