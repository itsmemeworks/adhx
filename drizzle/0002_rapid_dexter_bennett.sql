-- Add tag_shares table for public tag sharing feature
CREATE TABLE `tag_shares` (
	`user_id` text NOT NULL,
	`tag` text NOT NULL,
	`share_code` text NOT NULL,
	`is_public` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text,
	PRIMARY KEY(`user_id`, `tag`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_shares_share_code_unique` ON `tag_shares` (`share_code`);--> statement-breakpoint
CREATE INDEX `tag_shares_share_code_idx` ON `tag_shares` (`share_code`);--> statement-breakpoint
-- Performance indexes for common queries
CREATE INDEX `bookmarks_user_processed_at_idx` ON `bookmarks` (`user_id`,`processed_at`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_category_idx` ON `bookmarks` (`user_id`,`category`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_quoted_tweet_idx` ON `bookmarks` (`user_id`,`quoted_tweet_id`);--> statement-breakpoint
CREATE INDEX `read_status_user_id_idx` ON `read_status` (`user_id`);
