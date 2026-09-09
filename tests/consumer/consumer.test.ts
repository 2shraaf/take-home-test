import { eq } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { forms, rawIngests } from "../../src/db/schema";
import { deliverEmail, processIngest } from "../../src/consumer/pipeline";
import { retryAllFailed, retryIngest } from "../../src/consumer/manual_retry";
import {
	recoverInProgress,
	runSweep,
	startConsumer,
	stopConsumer,
	triggerProcessing,
} from "../../src/consumer/sweep";
import { ingestRawPayload } from "../../src/forms/ingest";
import * as idealpostcodes from "../../src/providers/idealpostcodes";
import * as sendgrid from "../../src/providers/sendgrid";
import { forceProvider, resetProviders } from "../../src/providers/test_control";
import { resetDb } from "../helpers/db";
import { makeIngestedForm } from "../helpers/factories";

const ingest = (payload: unknown): string => {
	const outcome = ingestRawPayload(payload);
	if (!outcome.ok) {
		throw new Error(`unexpected ingest failure: ${outcome.reason}`);
	}
	return outcome.id;
};

const ingestRow = (id: string) =>
	getDb().select().from(rawIngests).where(eq(rawIngests.id, id)).get();

const formForIngest = (id: string) =>
	getDb().select().from(forms).where(eq(forms.ingestId, id)).get();

beforeEach(() => {
	resetDb();
	forceProvider("geocode", "success", 0);
	forceProvider("email", "success", 0);
});

afterEach(() => {
	jest.restoreAllMocks();
	resetProviders();
});

afterAll(() => {
	// Belt-and-braces: make sure no sweep interval outlives the file.
	stopConsumer();
});

describe("processIngest — validate, transform, geocode, persist (ticket 04)", () => {
	it("transforms a valid ingest: name split, gender map, date parse, address flatten", async () => {
		const id = ingest(
			makeIngestedForm({
				name: "Andy James Smith-Jones",
				gender: "other",
				date_of_birth: "1985-06-20",
				phone_number: undefined,
				address: {
					address_line_1: "1 The Avenue",
					address_line_2: "Bristol",
					address_line_3: undefined,
					postcode: "BS1 1AA",
					country: "United Kingdom",
				},
			}),
		);

		await processIngest(id);

		const form = formForIngest(id);
		expect(form).toBeDefined();
		expect(form?.firstName).toBe("Andy James");
		expect(form?.lastName).toBe("Smith-Jones");
		expect(form?.gender).toBe("prefer-not-to-say");
		expect(form?.dateOfBirth).toBeInstanceOf(Date);
		expect(form?.dateOfBirth.getUTCFullYear()).toBe(1985);
		expect(form?.addressLine1).toBe("1 The Avenue");
		expect(form?.addressLine3).toBeNull();
		expect(form?.phoneNumber).toBeNull();
		expect(ingestRow(id)?.status).toBe("complete");
	});

	it("geocodes the postcode and persists longitude/latitude on the form", async () => {
		const id = ingest(makeIngestedForm());

		await processIngest(id);

		const form = formForIngest(id);
		expect(form?.longitude).toBe(50.05);
		expect(form?.latitude).toBe(-5.05);
	});

	it("preserves the raw payload and captures the error on a schema-validation failure", async () => {
		const bad = { ...makeIngestedForm(), gender: "unspecified" };
		const id = ingest(bad);

		await processIngest(id);

		const row = ingestRow(id);
		expect(row?.status).toBe("failed_validation");
		expect(row?.validationError).toMatch(/gender/);
		expect(JSON.parse(row!.rawPayload)).toMatchObject({ gender: "unspecified" });
		expect(formForIngest(id)).toBeUndefined();
	});

	it("never auto-retries a failed_validation ingest via the sweep", async () => {
		const id = ingest({ ...makeIngestedForm(), date_of_birth: "not-a-date" });
		await processIngest(id);
		expect(ingestRow(id)?.status).toBe("failed_validation");

		await runSweep();

		expect(ingestRow(id)?.status).toBe("failed_validation");
		expect(formForIngest(id)).toBeUndefined();
	});

	it("moves a geocode failure to failed_transient, distinct from validation failure and sweep-eligible", async () => {
		forceProvider("geocode", "failure", 0);
		const id = ingest(makeIngestedForm());

		await processIngest(id);

		const row = ingestRow(id);
		expect(row?.status).toBe("failed_transient");
		expect(row?.status).not.toBe("failed_validation");
		expect(row?.nextAttemptAt).not.toBeNull();
		expect(formForIngest(id)).toBeUndefined();

		// The automatic sweep heals it once geocoding recovers.
		forceProvider("geocode", "success", 0);
		await runSweep();
		expect(ingestRow(id)?.status).toBe("complete");
	});

	it("flags an application_reference reused under a different session_id (ADR-0003)", async () => {
		const first = ingest(makeIngestedForm({ application_reference: "SHARED-REF" }));
		await processIngest(first);
		expect(ingestRow(first)?.status).toBe("complete");

		const second = ingest(
			makeIngestedForm({ application_reference: "SHARED-REF" }), // different session_id
		);
		await processIngest(second);

		expect(ingestRow(second)?.status).toBe("possible_duplicate");
		expect(formForIngest(second)).toBeUndefined();
	});

	it("creates the form and its pending email obligation in one durable step", async () => {
		// Force the email to fail: the form is persisted, but its obligation must
		// already exist (pending) — there is no form without an obligation.
		forceProvider("email", "failure", 0);
		const id = ingest(makeIngestedForm());

		await processIngest(id);

		const form = formForIngest(id);
		expect(form).toBeDefined();
		expect(form?.emailStatus).toBe("pending");
		expect(ingestRow(id)?.status).toBe("complete");
	});

	it("enforces one form per ingest even under a concurrent double-process (claim mechanism)", async () => {
		const id = ingest(makeIngestedForm());

		await Promise.all([processIngest(id), processIngest(id)]);

		const all = getDb().select().from(forms).where(eq(forms.ingestId, id)).all();
		expect(all).toHaveLength(1);
		expect(ingestRow(id)?.status).toBe("complete");
	});

	it("rolls back atomically if the process crashes during persist, then recovers", async () => {
		const db = getDb();
		// Simulate a crash the instant the persist transaction begins.
		const txSpy = jest.spyOn(db, "transaction").mockImplementation(() => {
			throw new Error("crash between form insert and obligation");
		});

		const id = ingest(makeIngestedForm());
		await expect(processIngest(id)).rejects.toThrow(/crash/);

		// Nothing half-written: no form, and the ingest is not marked complete.
		expect(formForIngest(id)).toBeUndefined();
		expect(ingestRow(id)?.status).not.toBe("complete");

		// After the "restart", recovery + the sweep drive it to completion — form
		// and its pending obligation appear together, exactly once.
		txSpy.mockRestore();
		recoverInProgress();
		await runSweep();

		const formsForId = getDb().select().from(forms).where(eq(forms.ingestId, id)).all();
		expect(formsForId).toHaveLength(1);
		expect(formsForId[0].emailStatus).toBe("sent");
		expect(ingestRow(id)?.status).toBe("complete");
	});
});

describe("deliverEmail — the guaranteed obligation (ticket 05)", () => {
	it("sends the notification to happyforms@bots.com on success", async () => {
		const spy = jest.spyOn(sendgrid, "sendEmail");
		const id = ingest(makeIngestedForm());

		await processIngest(id);

		expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: "happyforms@bots.com" }));
		expect(formForIngest(id)?.emailStatus).toBe("sent");
	});

	it("records attempt timing and error against the obligation when a send fails", async () => {
		forceProvider("email", "failure", 0);
		const id = ingest(makeIngestedForm());

		await processIngest(id);

		const form = formForIngest(id);
		expect(form?.emailStatus).toBe("pending");
		expect(form?.emailRetryCount).toBeGreaterThan(0);
		expect(form?.emailLastError).not.toBeNull();
		expect(form?.emailLastAttemptAt).not.toBeNull();
		expect(form?.emailNextAttemptAt).not.toBeNull();
	});

	it("retries only the email — never re-geocodes or re-persists the form", async () => {
		forceProvider("email", "failure", 0);
		const geoSpy = jest.spyOn(idealpostcodes, "lookupPostcode");
		const id = ingest(makeIngestedForm());
		await processIngest(id);

		const formId = formForIngest(id)!.id;
		expect(geoSpy).toHaveBeenCalledTimes(1);
		geoSpy.mockClear();

		forceProvider("email", "success", 0);
		await deliverEmail(formId);

		expect(geoSpy).not.toHaveBeenCalled();
		const all = getDb().select().from(forms).where(eq(forms.ingestId, id)).all();
		expect(all).toHaveLength(1);
		expect(all[0].id).toBe(formId);
		expect(all[0].emailStatus).toBe("sent");
	});

	it("sends only once when two delivery passes race the same obligation", async () => {
		// Persist a form whose obligation is pending and due.
		forceProvider("email", "failure", 0);
		const id = ingest(makeIngestedForm());
		await processIngest(id);
		const formId = formForIngest(id)!.id;
		getDb().update(forms).set({ emailNextAttemptAt: null }).where(eq(forms.id, formId)).run();

		forceProvider("email", "success", 20); // in flight long enough for both to overlap
		const spy = jest.spyOn(sendgrid, "sendEmail");

		await Promise.all([deliverEmail(formId), deliverEmail(formId)]);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(formForIngest(id)?.emailStatus).toBe("sent");
	});

	it("never re-sends an obligation that has already been sent", async () => {
		const id = ingest(makeIngestedForm());
		await processIngest(id);
		expect(formForIngest(id)?.emailStatus).toBe("sent");

		const spy = jest.spyOn(sendgrid, "sendEmail");
		await runSweep();
		await deliverEmail(formForIngest(id)!.id);

		expect(spy).not.toHaveBeenCalled();
	});

	it("leaves an obligation eligible after retries are exhausted, until it eventually succeeds", async () => {
		forceProvider("email", "failure", 0);
		const id = ingest(makeIngestedForm());
		await processIngest(id);
		expect(formForIngest(id)?.emailStatus).toBe("pending");

		// Several sweep cycles keep failing but never abandon the obligation.
		await runSweep();
		await runSweep();
		expect(formForIngest(id)?.emailStatus).toBe("pending");

		forceProvider("email", "success", 0);
		await runSweep();
		expect(formForIngest(id)?.emailStatus).toBe("sent");
	});
});

describe("recovery, sweep and manual retry (ticket 06)", () => {
	it("picks up an ingest left mid-processing by a crash, on startup", async () => {
		const id = ingest(makeIngestedForm());
		getDb()
			.update(rawIngests)
			.set({ status: "processing", lockedAt: Date.now() })
			.where(eq(rawIngests.id, id))
			.run();

		recoverInProgress();
		expect(ingestRow(id)?.status).toBe("pending");

		await runSweep();
		expect(ingestRow(id)?.status).toBe("complete");
	});

	it("the sweep retries failed_transient ingests with no manual call", async () => {
		forceProvider("geocode", "failure", 0);
		const id = ingest(makeIngestedForm());
		await processIngest(id);
		expect(ingestRow(id)?.status).toBe("failed_transient");

		forceProvider("geocode", "success", 0);
		await runSweep();

		expect(ingestRow(id)?.status).toBe("complete");
	});

	it("the sweep retries a pending email obligation with no manual call", async () => {
		forceProvider("email", "failure", 0);
		const id = ingest(makeIngestedForm());
		await processIngest(id);
		expect(formForIngest(id)?.emailStatus).toBe("pending");

		forceProvider("email", "success", 0);
		await runSweep();

		expect(formForIngest(id)?.emailStatus).toBe("sent");
	});

	it("two overlapping sweep passes cannot both process the same row", async () => {
		ingest(makeIngestedForm());
		ingest(makeIngestedForm());

		await Promise.all([runSweep(), runSweep()]);

		const rows = getDb().select().from(rawIngests).all();
		expect(rows.every((r) => r.status === "complete")).toBe(true);
		expect(getDb().select().from(forms).all()).toHaveLength(2);
	});

	it("targeted retry reprocesses one failed form", async () => {
		forceProvider("geocode", "failure", 0);
		const form = makeIngestedForm();
		const id = ingest(form);
		await processIngest(id);
		expect(ingestRow(id)?.status).toBe("failed_transient");

		forceProvider("geocode", "success", 0);
		const result = await retryIngest(form.session_id);

		expect(result).toMatchObject({ found: true, status: "complete" });
		expect(formForIngest(id)?.longitude).toBe(50.05);
	});

	it("targeted retry of an unknown session identifier reports not found", async () => {
		const result = await retryIngest("no-such-session");
		expect(result).toEqual({ found: false });
	});

	it("bulk retry reprocesses every currently-failed form", async () => {
		forceProvider("geocode", "failure", 0);
		const transientForm = makeIngestedForm();
		const transientId = ingest(transientForm);
		await processIngest(transientId);

		const invalidId = ingest({ ...makeIngestedForm(), gender: "nope" });
		await processIngest(invalidId);

		expect(ingestRow(transientId)?.status).toBe("failed_transient");
		expect(ingestRow(invalidId)?.status).toBe("failed_validation");

		// The "code fix" has shipped; geocoding also recovers.
		forceProvider("geocode", "success", 0);
		const result = await retryAllFailed();

		expect(result.retried).toBe(2);
		expect(ingestRow(transientId)?.status).toBe("complete");
		// Still invalid against current code — correctly stays failed_validation.
		expect(ingestRow(invalidId)?.status).toBe("failed_validation");
	});

	it("manually retrying a failed_validation ingest re-runs the full pipeline from validation", async () => {
		const badForm = makeIngestedForm({ gender: "other" });
		const id = ingest({ ...badForm, gender: "unspecified" });
		await processIngest(id);
		const firstUpdatedAt = ingestRow(id)!.updatedAt;
		expect(ingestRow(id)?.status).toBe("failed_validation");

		// A code fix now accepts this shape: rewrite the preserved raw payload to a
		// value current code would accept, then retry — it must re-validate,
		// transform, geocode and persist.
		getDb()
			.update(rawIngests)
			.set({ rawPayload: JSON.stringify(badForm) })
			.where(eq(rawIngests.id, id))
			.run();

		const result = await retryIngest(badForm.session_id);

		expect(result).toMatchObject({ found: true, status: "complete" });
		expect(ingestRow(id)!.updatedAt).toBeGreaterThanOrEqual(firstUpdatedAt);
		expect(formForIngest(id)?.gender).toBe("prefer-not-to-say");
		expect(formForIngest(id)?.longitude).toBe(50.05);
	});

	it("manually retrying a transformed form with a pending email resends only the email", async () => {
		forceProvider("email", "failure", 0);
		const form = makeIngestedForm();
		const id = ingest(form);
		await processIngest(id);
		const formId = formForIngest(id)!.id;

		const geoSpy = jest.spyOn(idealpostcodes, "lookupPostcode");
		forceProvider("email", "success", 0);
		await retryIngest(form.session_id);

		expect(geoSpy).not.toHaveBeenCalled();
		const all = getDb().select().from(forms).where(eq(forms.ingestId, id)).all();
		expect(all).toHaveLength(1);
		expect(all[0].id).toBe(formId);
		expect(all[0].emailStatus).toBe("sent");
	});

	it("no retry path ever produces two forms for one ingest", async () => {
		const form = makeIngestedForm();
		const id = ingest(form);
		await processIngest(id);

		await retryIngest(form.session_id);
		await retryIngest(form.session_id);
		await runSweep();

		expect(getDb().select().from(forms).where(eq(forms.ingestId, id)).all()).toHaveLength(1);
	});
});

describe("production consumer wiring (ticket 06)", () => {
	// The trigger/sweep are fire-and-forget; give their promise chain time to run.
	const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

	afterEach(() => {
		stopConsumer();
		process.env.AUTO_TRIGGER_CONSUMER = "false";
	});

	it("triggerProcessing kicks the consumer immediately after an ingest when enabled", async () => {
		process.env.AUTO_TRIGGER_CONSUMER = "true";
		const id = ingest(makeIngestedForm());

		triggerProcessing(id);
		await tick();
		await tick();

		expect(ingestRow(id)?.status).toBe("complete");
		expect(formForIngest(id)?.emailStatus).toBe("sent");
	});

	it("triggerProcessing is a no-op when auto-trigger is disabled", async () => {
		process.env.AUTO_TRIGGER_CONSUMER = "false";
		const id = ingest(makeIngestedForm());

		triggerProcessing(id);
		await tick();

		expect(ingestRow(id)?.status).toBe("pending");
	});

	it("startConsumer runs startup recovery and an immediate sweep", async () => {
		const id = ingest(makeIngestedForm());
		getDb()
			.update(rawIngests)
			.set({ status: "processing", lockedAt: Date.now() })
			.where(eq(rawIngests.id, id))
			.run();

		startConsumer();
		await tick();
		await tick();

		expect(ingestRow(id)?.status).toBe("complete");
	});
});
