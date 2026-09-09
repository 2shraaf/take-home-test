import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { loadConfig } from "../config";
import { getDb } from "../db/client";
import { forms, rawIngests, type IngestStatus } from "../db/schema";
import { messageOf } from "../errors";
import { buildFormRow } from "../forms/form_record";
import { transformForm } from "../forms/transform";
import { validateIngestedForm } from "../forms/validate";
import { log } from "../log";
import { lookupPostcode } from "../providers/idealpostcodes";
import { sendEmail } from "../providers/sendgrid";
import { backoffDelayMs, withRetry } from "./retry";

const TEAM_INBOX = "happyforms@bots.com";
const PIPELINE_FROM = "form-pipeline@healthtech-1.example";

/** Statuses a fresh full-pipeline pass will claim. */
const CLAIMABLE: IngestStatus[] = ["pending", "failed_transient"];

const retryOptions = () => {
	const { retryMaxAttempts, retryBaseDelayMs } = loadConfig();
	return { maxAttempts: retryMaxAttempts, baseDelayMs: retryBaseDelayMs };
};

const nextAttemptDelay = (attempt: number): number =>
	backoffDelayMs(attempt, loadConfig().retryBaseDelayMs);

/** Write a terminal (or flagged) status for an ingest and drop its claim. */
const settleIngest = (ingestId: string, status: IngestStatus): void => {
	getDb()
		.update(rawIngests)
		.set({ status, lockedAt: null, updatedAt: Date.now() })
		.where(eq(rawIngests.id, ingestId))
		.run();
};

/**
 * Atomic claim. A single UPDATE ... WHERE means two overlapping consumer passes
 * (the post-ingest trigger and a sweep, or two sweeps) can never both take the
 * row: the second sees 0 changed rows and bails. Also reclaims a row whose
 * previous pass crashed while holding the claim.
 */
const claimIngest = (ingestId: string): boolean => {
	const { staleLockMs } = loadConfig();
	const claimedAt = Date.now();
	const claim = getDb()
		.update(rawIngests)
		.set({ status: "processing", lockedAt: claimedAt, updatedAt: claimedAt })
		.where(
			and(
				eq(rawIngests.id, ingestId),
				or(
					inArray(rawIngests.status, CLAIMABLE),
					and(eq(rawIngests.status, "processing"), lte(rawIngests.lockedAt, claimedAt - staleLockMs)),
				),
			),
		)
		.run();
	return claim.changes > 0;
};

/** Geocode the postcode with the shared retry/backoff helper. Throws when exhausted. */
const geocode = async (
	ingestId: string,
	postcode: string,
): Promise<{ longitude: number; latitude: number }> => {
	const response = await withRetry(() => lookupPostcode(postcode), {
		...retryOptions(),
		onRetry: (attempt, error) => log("geocode_retry", { ingestId, attempt, error }),
	});
	if (!response.body) {
		throw new Error("geocoding returned success with no body");
	}
	return response.body;
};

/**
 * Drive one ingested form through validate → (ADR-0003 identity check) →
 * transform → geocode → persist(form + email obligation) → email.
 *
 * Directly callable and awaitable so tests can process a specific ingest
 * deterministically instead of racing the async trigger/sweep wiring.
 */
export const processIngest = async (ingestId: string): Promise<void> => {
	const db = getDb();

	if (!claimIngest(ingestId)) {
		return;
	}

	const row = db.select().from(rawIngests).where(eq(rawIngests.id, ingestId)).get();
	if (!row) {
		return;
	}

	// Defense in depth: if a form already exists for this ingest, the only work
	// left is its email obligation — never re-transform, re-geocode or re-persist,
	// never a second form record.
	const existingForm = db.select().from(forms).where(eq(forms.ingestId, ingestId)).get();
	if (existingForm) {
		await deliverEmail(existingForm.id);
		settleIngest(ingestId, "complete");
		return;
	}

	const validation = validateIngestedForm(JSON.parse(row.rawPayload) as unknown);
	if (!validation.ok) {
		// Preserve the raw payload; capture the error; exclude from automatic retry.
		log("validation_failed", { ingestId, sessionId: row.sessionId, error: validation.error });
		db.update(rawIngests)
			.set({
				status: "failed_validation",
				validationError: validation.error,
				lockedAt: null,
				updatedAt: Date.now(),
			})
			.where(eq(rawIngests.id, ingestId))
			.run();
		return;
	}
	const ingested = validation.value;
	log("validated", { ingestId, sessionId: ingested.session_id });

	// ADR-0003: a repeated application_reference under a *different* session_id is
	// flagged for human review — neither silently completed nor silently rejected.
	const collision = db
		.select({ id: forms.id })
		.from(forms)
		.where(
			and(
				eq(forms.applicationReference, ingested.application_reference),
				ne(forms.sessionId, ingested.session_id),
			),
		)
		.get();
	if (collision) {
		log("possible_duplicate", { ingestId, applicationReference: ingested.application_reference });
		settleIngest(ingestId, "possible_duplicate");
		return;
	}

	const transformed = transformForm(ingested);

	let coordinates: { longitude: number; latitude: number };
	try {
		coordinates = await geocode(ingestId, transformed.postcode);
	} catch (error) {
		// Transient: eligible for the automatic sweep and for manual retry, and
		// distinct from failed_validation.
		const message = messageOf(error);
		const attempts = row.retryCount + 1;
		log("geocode_failed", { ingestId, error: message });
		db.update(rawIngests)
			.set({
				status: "failed_transient",
				retryCount: attempts,
				lastError: message,
				nextAttemptAt: Date.now() + nextAttemptDelay(attempts),
				lockedAt: null,
				updatedAt: Date.now(),
			})
			.where(eq(rawIngests.id, ingestId))
			.run();
		return;
	}
	log("geocoded", { ingestId });

	// Persist the form AND its pending email obligation in ONE transaction. There
	// is never an observable state where the form exists without the obligation.
	const formId = randomUUID();
	const ts = Date.now();
	db.transaction((tx) => {
		tx.insert(forms)
			.values(buildFormRow(transformed, { ingestId, formId, timestamp: ts, ...coordinates }))
			.run();
		tx.update(rawIngests)
			.set({ status: "complete", lockedAt: null, lastError: null, updatedAt: ts })
			.where(eq(rawIngests.id, ingestId))
			.run();
	});
	log("transformed", { ingestId, formId });
	log("email_pending", { ingestId, formId });

	// Attempt delivery now; if it fails the obligation stays pending for the sweep.
	await deliverEmail(formId);
};

/**
 * Fulfil a form's email obligation. Idempotent: a form already `sent` is skipped,
 * so no retry pass ever sends it twice. Before sending, the obligation is
 * atomically leased (via `emailNextAttemptAt`) so an overlapping sweep can't send
 * the same one concurrently. On failure the obligation stays `pending` with its
 * attempt timing/error recorded — never marked permanently failed.
 */
export const deliverEmail = async (formId: string): Promise<void> => {
	const db = getDb();
	const { staleLockMs } = loadConfig();
	const attemptAt = Date.now();

	const form = db.select().from(forms).where(eq(forms.id, formId)).get();
	if (!form || form.emailStatus === "sent") {
		return;
	}

	// Lease the obligation: push emailNextAttemptAt out so a concurrent sweep pass
	// skips it while this send is in flight. If we crash mid-send the lease
	// expires and the obligation becomes due again.
	const lease = db
		.update(forms)
		.set({ emailNextAttemptAt: attemptAt + staleLockMs, updatedAt: attemptAt })
		.where(
			and(
				eq(forms.id, formId),
				eq(forms.emailStatus, "pending"),
				or(isNull(forms.emailNextAttemptAt), lte(forms.emailNextAttemptAt, attemptAt)),
			),
		)
		.run();
	if (lease.changes === 0) {
		return;
	}

	try {
		await withRetry(
			() =>
				sendEmail({
					to: TEAM_INBOX,
					from: PIPELINE_FROM,
					subject: `Form ingested: ${form.sessionId}`,
					body: `Application ${form.applicationReference} was ingested and transformed for the FORM-BOT.`,
				}),
			{ ...retryOptions(), onRetry: (attempt, error) => log("email_failed", { formId, attempt, error }) },
		);
		const ts = Date.now();
		db.update(forms)
			.set({
				emailStatus: "sent",
				emailSentAt: ts,
				emailLastAttemptAt: attemptAt,
				emailLastError: null,
				emailNextAttemptAt: null,
				updatedAt: ts,
			})
			.where(eq(forms.id, formId))
			.run();
		log("email_sent", { formId });
	} catch (error) {
		const message = messageOf(error);
		const attempts = form.emailRetryCount + 1;
		const ts = Date.now();
		db.update(forms)
			.set({
				emailRetryCount: attempts,
				emailLastError: message,
				emailLastAttemptAt: attemptAt,
				emailNextAttemptAt: ts + nextAttemptDelay(attempts),
				updatedAt: ts,
			})
			.where(eq(forms.id, formId))
			.run();
		log("email_failed", { formId, error: message, exhausted: true });
	}
};
