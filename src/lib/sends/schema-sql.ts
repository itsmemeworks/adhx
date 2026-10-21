/**
 * Tables for "Send straight to your people" and "Tell me when it's live"
 * (docs/specs/friends-feed.md). Shared by `migrate.ts` and the test DDL, so
 * both stay the same. Every statement is idempotent. All three are
 * user-linked: account guards cover each user column, and account delete /
 * clear remove the rows.
 */
export const BOARD_FEATURES_DDL = `
  CREATE TABLE IF NOT EXISTS post_sends (
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    seen_at TEXT,
    PRIMARY KEY (from_user_id, to_user_id, platform, post_id)
  );
  CREATE INDEX IF NOT EXISTS post_sends_to_idx ON post_sends(to_user_id, seen_at);
  CREATE TABLE IF NOT EXISTS moment_alert_subs (
    user_id TEXT NOT NULL,
    forming_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, forming_id)
  );
  CREATE INDEX IF NOT EXISTS moment_alert_subs_forming_idx ON moment_alert_subs(forming_id);
  CREATE TABLE IF NOT EXISTS moment_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    seen_at TEXT
  );
  CREATE INDEX IF NOT EXISTS moment_alerts_user_idx ON moment_alerts(user_id, created_at);
`
