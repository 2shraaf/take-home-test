import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Raw ingest log — the durable queue and recovery source (ADR-0002).
 *
 * Every incoming payload lands here exactly as received, before any validation,
 * so nothing is ever lost to a bad schema or a processing bug. `session_id`
 * carries a database-level uniqueness constraint: a duplicate is rejected at the
 * door, never deduplicated after the fact (ADR-0003). `application_reference` is
 * indexed but not uniqueness-enforced — a repeat under a different `session_id`
 * is flagged for review, not rejected (ADR-0003).
 */
export const rawIngests = sqliteTable(
	"raw_ingests",
	{
		/** Internal identifier, independent of the disputed session_id/application_reference. */
		id: text("id").primaryKey(),
		sessionId: text("session_id").notNull().unique(),
		applicationReference: text("application_reference"),
		/** The raw payload exactly as received, JSON-encoded. */
		rawPayload: text("raw_payload").notNull(),
		/**
		 * pending | processing | failed_validation | failed_transient
		 * | possible_duplicate | complete
		 */
		status: text("status").notNull().default("pending"),
		retryCount: integer("retry_count").notNull().default(0),
		/** Epoch ms; when a failed_transient row becomes eligible for the sweep again. */
		nextAttemptAt: integer("next_attempt_at"),
		/** Epoch ms; set when a consumer pass claims the row, cleared when it releases it. */
		lockedAt: integer("locked_at"),
		/** Captured validation error for a failed_validation row (raw payload is never discarded). */
		validationError: text("validation_error"),
		lastError: text("last_error"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("raw_ingests_application_reference_idx").on(table.applicationReference)],
);

/**
 * Transformed forms — FORM-BOT-ready records (per transformed_schema.ts), plus
 * the email-delivery obligation as columns written in the same durable step.
 *
 * `ingest_id` is unique: defense in depth against ever creating two forms for one
 * ingest, even under a retry bug.
 */
export const forms = sqliteTable("forms", {
	id: text("id").primaryKey(),
	ingestId: text("ingest_id")
		.notNull()
		.unique()
		.references(() => rawIngests.id),
	sessionId: text("session_id").notNull(),
	applicationReference: text("application_reference").notNull(),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	/** True when `name` had no whitespace: given-name-only, empty surname, flagged not failed. */
	nameFlagged: integer("name_flagged", { mode: "boolean" }).notNull().default(false),
	email: text("email").notNull(),
	gender: text("gender").notNull(),
	dateOfBirth: integer("date_of_birth", { mode: "timestamp_ms" }).notNull(),
	phoneNumber: text("phone_number"),
	mobileNumber: text("mobile_number").notNull(),
	addressLine1: text("address_line_1").notNull(),
	addressLine2: text("address_line_2").notNull(),
	addressLine3: text("address_line_3"),
	postcode: text("postcode").notNull(),
	country: text("country").notNull(),
	longitude: real("longitude").notNull(),
	latitude: real("latitude").notNull(),
	/** The email obligation: pending | sent. Created with the form, never a later step. */
	emailStatus: text("email_status").notNull().default("pending"),
	emailRetryCount: integer("email_retry_count").notNull().default(0),
	emailNextAttemptAt: integer("email_next_attempt_at"),
	emailLastError: text("email_last_error"),
	emailLastAttemptAt: integer("email_last_attempt_at"),
	emailSentAt: integer("email_sent_at"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export type RawIngestRow = typeof rawIngests.$inferSelect;
export type FormRow = typeof forms.$inferSelect;

export type IngestStatus =
	| "pending"
	| "processing"
	| "failed_validation"
	| "failed_transient"
	| "possible_duplicate"
	| "complete";
