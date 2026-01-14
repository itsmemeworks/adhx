CREATE TABLE `bookmark_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bookmark_id` text NOT NULL,
	`original_url` text,
	`expanded_url` text NOT NULL,
	`link_type` text,
	`domain` text,
	`content_json` text,
	`preview_title` text,
	`preview_description` text,
	`preview_image_url` text,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bookmark_media` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bookmark_tags` (
	`bookmark_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`bookmark_id`, `tag`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
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
	`raw_json` text
);
--> statement-breakpoint
CREATE TABLE `collection_tweets` (
	`collection_id` text NOT NULL,
	`bookmark_id` text NOT NULL,
	`added_at` text DEFAULT CURRENT_TIMESTAMP,
	`notes` text,
	PRIMARY KEY(`collection_id`, `bookmark_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`description` text,
	`color` text,
	`icon` text,
	`share_code` text,
	`is_public` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_share_code_unique` ON `collections` (`share_code`);--> statement-breakpoint
CREATE TABLE `oauth_state` (
	`state` text PRIMARY KEY NOT NULL,
	`code_verifier` text NOT NULL,
	`created_at` text DEFAULT '2026-01-14T10:09:15.897Z'
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text,
	`profile_image_url` text,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`scopes` text,
	`created_at` text DEFAULT '2026-01-14T10:09:15.896Z',
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `read_status` (
	`bookmark_id` text PRIMARY KEY NOT NULL,
	`read_at` text NOT NULL,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text NOT NULL,
	`total_fetched` integer DEFAULT 0,
	`new_bookmarks` integer DEFAULT 0,
	`duplicates_skipped` integer DEFAULT 0,
	`categorized` integer DEFAULT 0,
	`error_message` text,
	`trigger_type` text
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`value` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text,
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text
);
