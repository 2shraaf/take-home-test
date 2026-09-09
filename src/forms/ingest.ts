import { randomUUID } from "node:crypto";
import { getDb } from "../db/client";
import { rawIngests } from "../db/schema";

/**
 * Durable capture of a raw payload. This is the only place a `raw_ingests` row is
 * born, shared by the HTTP endpoint and by tests, so the durability + duplicate
 * rules live in exactly one spot.
 *
 * Duplicate rejection is by the database-level uniqueness constraint on
 * `session_id` — never an application-level check-then-insert, which races under
 * concurrent requests.
 */
export type IngestOutcome =
	| { ok: true; id: string; sessionId: string }
	| { ok: false; reason: "missing_session_id" }
	| { ok: false; reason: "duplicate"; sessionId: string };

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof Error && /UNIQUE constraint failed/i.test(error.message);

export const ingestRawPayload = (payload: unknown): IngestOutcome => {
	const record = (payload ?? {}) as Record<string, unknown>;
	const sessionId = record.session_id;
	if (typeof sessionId !== "string" || sessionId.length === 0) {
		return { ok: false, reason: "missing_session_id" };
	}

	const applicationReference = record.application_reference;
	const id = randomUUID();
	const now = Date.now();

	try {
		getDb()
			.insert(rawIngests)
			.values({
				id,
				sessionId,
				applicationReference:
					typeof applicationReference === "string" ? applicationReference : null,
				rawPayload: JSON.stringify(payload),
				status: "pending",
				createdAt: now,
				updatedAt: now,
			})
			.run();
	} catch (error) {
		if (isUniqueViolation(error)) {
			return { ok: false, reason: "duplicate", sessionId };
		}
		throw error;
	}

	return { ok: true, id, sessionId };
};
