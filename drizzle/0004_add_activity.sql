CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`platform` text DEFAULT 'twitter' NOT NULL,
	`bookmark_id` text NOT NULL,
	`author` text NOT NULL,
	`author_name` text,
	`text` text,
	`thumbnail_url` text,
	`url` text NOT NULL,
	`user_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_created_at_idx` ON `activity` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_dedupe_idx` ON `activity` (`action`,`platform`,`bookmark_id`,`created_at`);
