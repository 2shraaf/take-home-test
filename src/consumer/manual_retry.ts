import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { forms, rawIngests, type IngestStatus } from "../db/schema";
import { deliverEmail, processIngest } from "./pipeline";

export type RetryResult =
	| { found: false }
	| { found: true; status: IngestStatus; emailStatus?: string };

/**
 * Manual retry of one form by session identifier. Resumes from whatever stage the
 * form actually needs: a full pipeline pass if it never transformed, an
 * email-only attempt if it already did. Can never produce a second form.
 */
export const retryIngest = async (sessionId: string): Promise<RetryResult> => {
	const db = getDb();
	const row = db.select().from(rawIngests).where(eq(rawIngests.sessionId, sessionId)).get();
	if (!row) {
		return { found: false };
	}

	const form = db.select().from(forms).where(eq(forms.ingestId, row.id)).get();

	if (form) {
		if (form.emailStatus === "pending") {
			// Manual retry ignores the backoff schedule: make the obligation due now.
			db.update(forms)
				.set({ emailNextAttemptAt: null, updatedAt: Date.now() })
				.where(eq(forms.id, form.id))
				.run();
			await deliverEmail(form.id);
		}
	} else {
		db.update(rawIngests)
			.set({
				status: "pending",
				validationError: null,
				lastError: null,
				nextAttemptAt: null,
				lockedAt: null,
				updatedAt: Date.now(),
			})
			.where(eq(rawIngests.id, row.id))
			.run();
		await processIngest(row.id);
	}

	const updated = db.select().from(rawIngests).where(eq(rawIngests.id, row.id)).get();
	const updatedForm = db.select().from(forms).where(eq(forms.ingestId, row.id)).get();
	return {
		found: true,
		status: (updated?.status ?? row.status) as IngestStatus,
		emailStatus: updatedForm?.emailStatus,
	};
};

/** Bulk retry of every currently-failed form — for use right after a fix ships. */
export const retryAllFailed = async (): Promise<{ retried: number }> => {
	const db = getDb();
	const rows = db
		.select({ sessionId: rawIngests.sessionId })
		.from(rawIngests)
		.where(inArray(rawIngests.status, ["failed_validation", "failed_transient"]))
		.all();
	for (const { sessionId } of rows) {
		await retryIngest(sessionId);
	}
	return { retried: rows.length };
};
