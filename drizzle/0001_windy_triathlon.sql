-- Add source column to bookmarks table
-- Tracks how each bookmark was added: 'sync', 'manual', or 'url_prefix'
ALTER TABLE `bookmarks` ADD `source` text DEFAULT 'sync';--> statement-breakpoint

-- Add index for querying by source (optional, for performance)
CREATE INDEX IF NOT EXISTS `idx_bookmarks_source` ON `bookmarks`(`source`);
