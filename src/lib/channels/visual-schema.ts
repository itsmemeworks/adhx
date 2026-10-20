/** Disposable, bounded channel refinements; no original save or media is changed. */
export const CHANNEL_VISUAL_DDL = `
CREATE TABLE IF NOT EXISTS channel_visual_jobs (
  scope TEXT NOT NULL,
  slug TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  payload TEXT NOT NULL,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  lease TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, slug),
  CHECK ((user_id IS NULL AND scope = 'everyone') OR (user_id IS NOT NULL AND scope = 'user:' || user_id))
);
CREATE INDEX IF NOT EXISTS channel_visual_pending ON channel_visual_jobs(status, available_at);
CREATE TABLE IF NOT EXISTS channel_visual_budget (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  last_request_at INTEGER NOT NULL DEFAULT 0
);
`
