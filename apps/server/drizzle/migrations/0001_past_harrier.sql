CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `url_tags` (
	`url_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`url_id`, `tag_id`),
	FOREIGN KEY (`url_id`) REFERENCES `urls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
