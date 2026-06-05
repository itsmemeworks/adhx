DROP INDEX IF EXISTS `bookmark_links_user_bookmark_idx`;--> statement-breakpoint
ALTER TABLE `bookmark_links` ADD `platform` text DEFAULT 'twitter' NOT NULL;--> statement-breakpoint
CREATE INDEX `bookmark_links_user_bookmark_idx` ON `bookmark_links` (`user_id`,`platform`,`bookmark_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bookmark_media` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`platform` text DEFAULT 'twitter' NOT NULL,
	`bookmark_id` text NOT NULL,
	`media_type` text NOT NULL,
	`original_url` text NOT NULL,
	`preview_url` text,
	`local_path` text,
	`thumbnail_path` text,
	`download_status` text DEFAULT 'pending',
	`downloaded_at` text,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`file_size_bytes` integer,
	`alt_text` text,
	PRIMARY KEY(`user_id`, `platform`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_bookmark_media`("id", "user_id", "platform", "bookmark_id", "media_type", "original_url", "preview_url", "local_path", "thumbnail_path", "download_status", "downloaded_at", "width", "height", "duration_ms", "file_size_bytes", "alt_text") SELECT "id", "user_id", 'twitter', "bookmark_id", "media_type", "original_url", "preview_url", "local_path", "thumbnail_path", "download_status", "downloaded_at", "width", "height", "duration_ms", "file_size_bytes", "alt_text" FROM `bookmark_media`;--> statement-breakpoint
DROP TABLE `bookmark_media`;--> statement-breakpoint
ALTER TABLE `__new_bookmark_media` RENAME TO `bookmark_media`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `bookmark_media_user_bookmark_idx` ON `bookmark_media` (`user_id`,`platform`,`bookmark_id`);--> statement-breakpoint
CREATE TABLE `__new_bookmark_tags` (
	`user_id` text NOT NULL,
	`platform` text DEFAULT 'twitter' NOT NULL,
	`bookmark_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`user_id`, `platform`, `bookmark_id`, `tag`)
);
--> statement-breakpoint
INSERT INTO `__new_bookmark_tags`("user_id", "platform", "bookmark_id", "tag") SELECT "user_id", 'twitter', "bookmark_id", "tag" FROM `bookmark_tags`;--> statement-breakpoint
DROP TABLE `bookmark_tags`;--> statement-breakpoint
ALTER TABLE `__new_bookmark_tags` RENAME TO `bookmark_tags`;--> statement-breakpoint
CREATE INDEX `bookmark_tags_user_id_idx` ON `bookmark_tags` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_bookmarks` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`platform` text DEFAULT 'twitter' NOT NULL,
	`author` text NOT NULL,
	`author_name` text,
	`author_profile_image_url` text,
	`text` text NOT NULL,
	`tweet_url` text NOT NULL,
	`created_at` text,
	`processed_at` text NOT NULL,
	`category` text DEFAULT 'tweet',
	`is_reply` integer DEFAULT false,
	`reply_context` text,
	`is_quote` integer DEFAULT false,
	`quote_context` text,
	`quoted_tweet_id` text,
	`is_retweet` integer DEFAULT false,
	`retweet_context` text,
	`extracted_content` text,
	`filed_path` text,
	`needs_transcript` integer DEFAULT false,
	`summary` text,
	`source` text DEFAULT 'sync',
	`raw_json` text,
	PRIMARY KEY(`user_id`, `platform`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_bookmarks`("id", "user_id", "platform", "author", "author_name", "author_profile_image_url", "text", "tweet_url", "created_at", "processed_at", "category", "is_reply", "reply_context", "is_quote", "quote_context", "quoted_tweet_id", "is_retweet", "retweet_context", "extracted_content", "filed_path", "needs_transcript", "summary", "source", "raw_json") SELECT "id", "user_id", 'twitter', "author", "author_name", "author_profile_image_url", "text", "tweet_url", "created_at", "processed_at", "category", "is_reply", "reply_context", "is_quote", "quote_context", "quoted_tweet_id", "is_retweet", "retweet_context", "extracted_content", "filed_path", "needs_transcript", "summary", "source", "raw_json" FROM `bookmarks`;--> statement-breakpoint
DROP TABLE `bookmarks`;--> statement-breakpoint
ALTER TABLE `__new_bookmarks` RENAME TO `bookmarks`;--> statement-breakpoint
CREATE INDEX `bookmarks_user_id_idx` ON `bookmarks` (`user_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_processed_at_idx` ON `bookmarks` (`processed_at`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_processed_at_idx` ON `bookmarks` (`user_id`,`processed_at`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_category_idx` ON `bookmarks` (`user_id`,`category`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_platform_idx` ON `bookmarks` (`user_id`,`platform`);--> statement-breakpoint
CREATE INDEX `bookmarks_user_quoted_tweet_idx` ON `bookmarks` (`user_id`,`quoted_tweet_id`);--> statement-breakpoint
CREATE TABLE `__new_collection_tweets` (
	`user_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`platform` text DEFAULT 'twitter' NOT NULL,
	`bookmark_id` text NOT NULL,
	`added_at` text DEFAULT CURRENT_TIMESTAMP,
	`notes` text,
	PRIMARY KEY(`user_id`, `collection_id`, `platform`, `bookmark_id`)
);
--> statement-breakpoint
INSERT INTO `__new_collection_tweets`("user_id", "collection_id", "platform", "bookmark_id", "added_at", "notes") SELECT "user_id", "collection_id", 'twitter', "bookmark_id", "added_at", "notes" FROM `collection_tweets`;--> statement-breakpoint
DROP TABLE `collection_tweets`;--> statement-breakpoint
ALTER TABLE `__new_collection_tweets` RENAME TO `collection_tweets`;--> statement-breakpoint
CREATE TABLE `__new_read_status` (
	`user_id` text NOT NULL,
	`platform` text DEFAULT 'twitter' NOT NULL,
	`bookmark_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `platform`, `bookmark_id`)
);
--> statement-breakpoint
INSERT INTO `__new_read_status`("user_id", "platform", "bookmark_id", "read_at") SELECT "user_id", 'twitter', "bookmark_id", "read_at" FROM `read_status`;--> statement-breakpoint
DROP TABLE `read_status`;--> statement-breakpoint
ALTER TABLE `__new_read_status` RENAME TO `read_status`;--> statement-breakpoint
CREATE INDEX `read_status_user_id_idx` ON `read_status` (`user_id`);