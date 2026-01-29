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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_oauth_state` (
	`state` text PRIMARY KEY NOT NULL,
	`code_verifier` text NOT NULL,
	`created_at` text DEFAULT '2026-01-29T16:06:51.842Z'
);
--> statement-breakpoint
INSERT INTO `__new_oauth_state`("state", "code_verifier", "created_at") SELECT "state", "code_verifier", "created_at" FROM `oauth_state`;--> statement-breakpoint
DROP TABLE `oauth_state`;--> statement-breakpoint
ALTER TABLE `__new_oauth_state` RENAME TO `oauth_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_oauth_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text,
	`profile_image_url` text,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`scopes` text,
	`created_at` text DEFAULT '2026-01-29T16:06:51.841Z',
	`updated_at` text
);
--> statement-breakpoint
INSERT INTO `__new_oauth_tokens`("user_id", "username", "profile_image_url", "access_token", "refresh_token", "expires_at", "scopes", "created_at", "updated_at") SELECT "user_id", "username", "profile_image_url", "access_token", "refresh_token", "expires_at", "scopes", "created_at", "updated_at" FROM `oauth_tokens`;--> statement-breakpoint
DROP TABLE `oauth_tokens`;--> statement-breakpoint
ALTER TABLE `__new_oauth_tokens` RENAME TO `oauth_tokens`;--> statement-breakpoint
CREATE INDEX `bookmarks_user_processed_at_idx` ON `bookmarks` (`user_id`,`processed_at`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_category_idx` ON `bookmarks` (`user_id`,`category`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_quoted_tweet_idx` ON `bookmarks` (`user_id`,`quoted_tweet_id`);--> statement-breakpoint
CREATE INDEX `read_status_user_id_idx` ON `read_status` (`user_id`);