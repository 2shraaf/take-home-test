import { and, eq, isNull, lte, or } from "drizzle-orm";
import { loadConfig } from "../config";
import { getDb } from "../db/client";
import { forms, rawIngests } from "../db/schema";
import { messageOf } from "../errors";
import { log } from "../log";
import { deliverEmail, processIngest } from "./pipeline";

/** On startup, anything left mid-processing from a crash is picked back up. */
export const recoverInProgress = (): void => {
	const reset = getDb()
		.update(rawIngests)
		.set({ status: "pending", lockedAt: null, updatedAt: Date.now() })
		.where(eq(rawIngests.status, "processing"))
		.run();
	if (reset.changes > 0) {
		log("startup_recovery", { recovered: reset.changes });
	}
};

/**
 * The interval safety net. Re-attempts due `failed_transient` ingests and pending
 * email obligations; never touches `failed_validation` or `possible_duplicate`.
 * Also reclaims rows whose previous pass crashed while holding the claim.
 */
export const runSweep = async (): Promise<void> => {
	const db = getDb();
	const now = Date.now();

	db.update(rawIngests)
		.set({ status: "pending", lockedAt: null, updatedAt: now })
		.where(
			and(eq(rawIngests.status, "processing"), lte(rawIngests.lockedAt, now - loadConfig().staleLockMs)),
		)
		.run();

	const dueIngests = db
		.select({ id: rawIngests.id })
		.from(rawIngests)
		.where(
			or(
				eq(rawIngests.status, "pending"),
				and(
					eq(rawIngests.status, "failed_transient"),
					or(isNull(rawIngests.nextAttemptAt), lte(rawIngests.nextAttemptAt, now)),
				),
			),
		)
		.all();
	for (const { id } of dueIngests) {
		await processIngest(id);
	}

	const dueEmails = db
		.select({ id: forms.id })
		.from(forms)
		.where(
			and(
				eq(forms.emailStatus, "pending"),
				or(isNull(forms.emailNextAttemptAt), lte(forms.emailNextAttemptAt, now)),
			),
		)
		.all();
	for (const { id } of dueEmails) {
		await deliverEmail(id);
	}

	if (dueIngests.length > 0 || dueEmails.length > 0) {
		log("sweep", { ingests: dueIngests.length, emails: dueEmails.length });
	}
};

let sweepTimer: ReturnType<typeof setInterval> | undefined;

export const startConsumer = (): void => {
	recoverInProgress();
	const { sweepIntervalMs } = loadConfig();
	sweepTimer = setInterval(() => {
		void runSweep().catch((error) => log("process_error", { error: messageOf(error) }));
	}, sweepIntervalMs);
	sweepTimer.unref?.();
	// Kick an immediate sweep so restart recovery doesn't wait a full interval.
	void runSweep().catch((error) => log("process_error", { error: messageOf(error) }));
};

export const stopConsumer = (): void => {
	if (sweepTimer) {
		clearInterval(sweepTimer);
	}
	sweepTimer = undefined;
};

/** Fire-and-forget trigger used by the ingest endpoint (disabled in tests). */
export const triggerProcessing = (ingestId: string): void => {
	if (!loadConfig().autoTriggerConsumer) {
		return;
	}
	void processIngest(ingestId).catch((error) =>
		log("process_error", { ingestId, error: messageOf(error) }),
	);
};
