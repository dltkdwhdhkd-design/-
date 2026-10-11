ALTER TABLE `field_positions` ADD `owner` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `field_positions` ADD `owner_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mafia_rooms` ADD `live_gate` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `mafia_rooms` ADD `live_locks` text DEFAULT '' NOT NULL;