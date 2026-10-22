/** Additive read-path indexes and replacements for shorter/duplicate indexes.
 * Run only after the guarded tables/columns exist. Used by startup and tests.
 * Never changes records, constraints or ownership. */
export const QUERY_INDEX_DDL = `
  CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON bookmarks(user_id);
  CREATE INDEX IF NOT EXISTS bookmarks_processed_at_idx ON bookmarks(processed_at);
  CREATE INDEX IF NOT EXISTS sync_logs_user_id_idx ON sync_logs(user_id);
  CREATE INDEX IF NOT EXISTS bookmarks_shared_recent_idx
    ON bookmarks(processed_at, user_id, platform, id)
    WHERE is_private = 0 AND COALESCE(source, '') != 'quoted';
  CREATE INDEX IF NOT EXISTS bookmarks_user_feed_idx ON bookmarks(user_id, processed_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS bookmarks_user_platform_feed_idx ON bookmarks(user_id, platform, processed_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS bookmark_tags_user_tag_idx ON bookmark_tags(user_id, tag, platform, bookmark_id);
  CREATE INDEX IF NOT EXISTS bookmark_media_post_idx ON bookmark_media(platform, bookmark_id);
  CREATE INDEX IF NOT EXISTS bookmark_links_post_idx ON bookmark_links(platform, bookmark_id);
  CREATE INDEX IF NOT EXISTS post_views_post_seen_idx ON post_views(platform, post_id, seen_at);
  CREATE INDEX IF NOT EXISTS post_views_user_seen_idx ON post_views(user_id, seen_at DESC);
  CREATE INDEX IF NOT EXISTS post_sends_inbox_idx ON post_sends(to_user_id, seen_at, created_at DESC);
  CREATE INDEX IF NOT EXISTS post_sends_sender_post_idx ON post_sends(from_user_id, platform, post_id, to_user_id);
  CREATE INDEX IF NOT EXISTS post_sends_recipient_post_idx ON post_sends(to_user_id, platform, post_id, seen_at);
  CREATE INDEX IF NOT EXISTS phone_save_queue_user_status_idx ON phone_save_queue(user_id, status);
  CREATE INDEX IF NOT EXISTS kept_files_path_idx ON kept_files(path);
  CREATE INDEX IF NOT EXISTS media_conversions_source_idx ON media_conversions(source_path, status);
  CREATE INDEX IF NOT EXISTS post_embeddings_failed_recent_idx
    ON post_embeddings(created_at, platform, post_id, kind) WHERE status='failed';
  CREATE INDEX IF NOT EXISTS post_extracted_failed_recent_idx
    ON post_extracted_text(created_at, platform, post_id, kind) WHERE status='failed';

  DROP INDEX IF EXISTS bookmarks_user_processed_at_idx;
  DROP INDEX IF EXISTS bookmarks_user_platform_idx;
  DROP INDEX IF EXISTS post_sends_to_idx;
  DROP INDEX IF EXISTS idx_bookmarks_user_id;
  DROP INDEX IF EXISTS idx_bookmarks_processed_at;
  DROP INDEX IF EXISTS idx_sync_logs_user_id;
`
