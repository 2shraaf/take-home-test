import express, { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { forms, rawIngests } from "./db/schema";
import { messageOf } from "./errors";
import { ingestRawPayload } from "./forms/ingest";
import { retryAllFailed, retryIngest } from "./consumer/manual_retry";
import { triggerProcessing } from "./consumer/sweep";
import { log } from "./log";

const app = express();

app.use(express.json());

/**
 * Durably capture the raw payload, then respond 202 without waiting for
 * processing. A duplicate `session_id` is rejected by the DB uniqueness
 * constraint (409). A payload with no `session_id` is rejected (400) — nothing
 * downstream can reference it.
 */
app.post("/ingest", (req: Request, res: Response) => {
	const outcome = ingestRawPayload(req.body);

	if (!outcome.ok) {
		if (outcome.reason === "missing_session_id") {
			return res.status(400).json({ error: "session_id is required" });
		}
		return res.status(409).json({ error: "duplicate session_id", sessionId: outcome.sessionId });
	}

	log("ingested", { ingestId: outcome.id, sessionId: outcome.sessionId });
	triggerProcessing(outcome.id);
	return res.status(202).json({ id: outcome.id, sessionId: outcome.sessionId, status: "pending" });
});

/** Current processing status for a form, by session identifier. */
app.get("/forms/:sessionId", (req: Request, res: Response) => {
	const db = getDb();
	const sessionId = String(req.params.sessionId);
	const ingest = db.select().from(rawIngests).where(eq(rawIngests.sessionId, sessionId)).get();

	if (!ingest) {
		return res.status(404).json({ error: "not found" });
	}

	const form = db.select().from(forms).where(eq(forms.ingestId, ingest.id)).get();

	return res.status(200).json({
		sessionId: sessionId,
		status: ingest.status,
		retryCount: ingest.retryCount,
		validationError: ingest.validationError ?? undefined,
		lastError: ingest.lastError ?? undefined,
		transformed: Boolean(form),
		email: form ? { status: form.emailStatus, sentAt: form.emailSentAt ?? undefined } : undefined,
	});
});

/** Manually retry one failed form. */
app.post("/retry/:sessionId", async (req: Request, res: Response) => {
	try {
		const sessionId = String(req.params.sessionId);
		const result = await retryIngest(sessionId);
		if (!result.found) {
			return res.status(404).json({ error: "not found" });
		}
		return res.status(200).json({
			sessionId,
			status: result.status,
			emailStatus: result.emailStatus,
		});
	} catch (error) {
		log("process_error", { error: messageOf(error) });
		return res.status(500).json({ error: "retry failed" });
	}
});

/** Manually retry every currently-failed form. */
app.post("/retry", async (_req: Request, res: Response) => {
	try {
		const result = await retryAllFailed();
		return res.status(200).json(result);
	} catch (error) {
		log("process_error", { error: messageOf(error) });
		return res.status(500).json({ error: "bulk retry failed" });
	}
});

export default app;
