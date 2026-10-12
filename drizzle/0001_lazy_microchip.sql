CREATE TABLE `field_positions` (
	`code` text NOT NULL,
	`player` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`at` integer NOT NULL,
	`seq` integer NOT NULL,
	`previous` text NOT NULL,
	`place` text NOT NULL,
	PRIMARY KEY(`code`, `player`)
);
