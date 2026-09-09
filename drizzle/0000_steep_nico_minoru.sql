CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`ingest_id` text NOT NULL,
	`session_id` text NOT NULL,
	`application_reference` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`name_flagged` integer DEFAULT false NOT NULL,
	`email` text NOT NULL,
	`gender` text NOT NULL,
	`date_of_birth` integer NOT NULL,
	`phone_number` text,
	`mobile_number` text NOT NULL,
	`address_line_1` text NOT NULL,
	`address_line_2` text NOT NULL,
	`address_line_3` text,
	`postcode` text NOT NULL,
	`country` text NOT NULL,
	`longitude` real NOT NULL,
	`latitude` real NOT NULL,
	`email_status` text DEFAULT 'pending' NOT NULL,
	`email_retry_count` integer DEFAULT 0 NOT NULL,
	`email_next_attempt_at` integer,
	`email_last_error` text,
	`email_last_attempt_at` integer,
	`email_sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ingest_id`) REFERENCES `raw_ingests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_ingest_id_unique` ON `forms` (`ingest_id`);--> statement-breakpoint
CREATE TABLE `raw_ingests` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`application_reference` text,
	`raw_payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`locked_at` integer,
	`validation_error` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_ingests_session_id_unique` ON `raw_ingests` (`session_id`);--> statement-breakpoint
CREATE INDEX `raw_ingests_application_reference_idx` ON `raw_ingests` (`application_reference`);