/** Shared by startup migration and the test schema. A durable revision lets
 * public caches recheck privacy in O(1), including across web processes and
 * direct database writes, without scanning every private save on each read.
 */
export const SAVE_VISIBILITY_DDL = `
  CREATE TRIGGER IF NOT EXISTS save_visibility_insert
  AFTER INSERT ON bookmarks BEGIN
    INSERT INTO server_settings(key,value,updated_at)
      VALUES('saves.visibility','1',CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1,updated_at=CURRENT_TIMESTAMP;
  END;
  CREATE TRIGGER IF NOT EXISTS save_visibility_delete
  AFTER DELETE ON bookmarks BEGIN
    INSERT INTO server_settings(key,value,updated_at)
      VALUES('saves.visibility','1',CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1,updated_at=CURRENT_TIMESTAMP;
  END;
  CREATE TRIGGER IF NOT EXISTS save_visibility_update
  AFTER UPDATE OF is_private,source,user_id,platform,id ON bookmarks
  WHEN OLD.is_private IS NOT NEW.is_private OR OLD.source IS NOT NEW.source
    OR OLD.user_id IS NOT NEW.user_id OR OLD.platform IS NOT NEW.platform OR OLD.id IS NOT NEW.id
  BEGIN
    INSERT INTO server_settings(key,value,updated_at)
      VALUES('saves.visibility','1',CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1,updated_at=CURRENT_TIMESTAMP;
  END;
`
