/**
 * Structured, single-line JSON log output emitted at each pipeline transition
 * (ingested, validated, transformation failure, geocode retry/failure,
 * transformation success, email pending, email sent/failed). Deliberately not a
 * logging framework — the spec scopes observability to plain structured output.
 */
export type LogEvent =
	| "ingested"
	| "validated"
	| "validation_failed"
	| "possible_duplicate"
	| "geocode_retry"
	| "geocode_failed"
	| "geocoded"
	| "transformed"
	| "email_pending"
	| "email_sent"
	| "email_failed"
	| "startup_recovery"
	| "sweep"
	| "process_error"
	| "ingest_error"
	| "server_started";

export const log = (event: LogEvent, data: Record<string, unknown> = {}): void => {
	// Keep the test runner's output readable unless a run explicitly opts in.
	if (process.env.NODE_ENV === "test" && process.env.LOG_IN_TESTS !== "true") {
		return;
	}
	process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
};
