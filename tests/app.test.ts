import request from "supertest";
import app from "../src/app";
import { processIngest, runSweep } from "../src/consumer/consumer";
import { forceProvider, resetProviders } from "../src/providers/test_control";
import { resetDb } from "./helpers/db";
import { makeIngestedForm } from "./helpers/factories";

beforeEach(() => {
	resetDb();
	forceProvider("geocode", "success", 0);
	forceProvider("email", "success", 0);
});

afterEach(() => resetProviders());

describe("POST /ingest", () => {
	it("captures the payload durably and responds 202 Accepted", async () => {
		const response = await request(app).post("/ingest").send(makeIngestedForm());

		expect(response.status).toBe(202);
		expect(response.body).toMatchObject({ status: "pending" });
		expect(typeof response.body.id).toBe("string");
	});

	it("accepts a payload that will later fail validation (captured now, validated by the consumer)", async () => {
		const form = makeIngestedForm();
		const response = await request(app)
			.post("/ingest")
			.send({ ...form, gender: "unspecified" });

		expect(response.status).toBe(202);

		await runSweep();

		const status = await request(app).get(`/forms/${form.session_id}`);
		expect(status.body.status).toBe("failed_validation");
		expect(status.body.validationError).toMatch(/gender/);
	});

	it("rejects a second ingest of the same session_id with 409", async () => {
		const form = makeIngestedForm();
		await request(app).post("/ingest").send(form);

		const duplicate = await request(app).post("/ingest").send(form);

		expect(duplicate.status).toBe(409);
		expect(duplicate.body.error).toMatch(/duplicate/i);
	});

	it("accepts only one of two concurrent ingests of the same session_id", async () => {
		const form = makeIngestedForm();

		const [a, b] = await Promise.all([
			request(app).post("/ingest").send(form),
			request(app).post("/ingest").send(form),
		]);

		const statuses = [a.status, b.status].sort();
		expect(statuses).toEqual([202, 409]);
	});

	it("rejects a payload with no session_id with 400", async () => {
		const { session_id, ...withoutSession } = makeIngestedForm();
		const response = await request(app).post("/ingest").send(withoutSession);

		expect(response.status).toBe(400);
		expect(response.body.error).toMatch(/session_id/);
	});
});

describe("GET /forms/:sessionId", () => {
	it("reports a form's current status through its lifecycle", async () => {
		const form = makeIngestedForm();
		const ingestResponse = await request(app).post("/ingest").send(form);

		const pending = await request(app).get(`/forms/${form.session_id}`);
		expect(pending.status).toBe(200);
		expect(pending.body.status).toBe("pending");
		expect(pending.body.transformed).toBe(false);

		await processIngest(ingestResponse.body.id);

		const complete = await request(app).get(`/forms/${form.session_id}`);
		expect(complete.body.status).toBe("complete");
		expect(complete.body.transformed).toBe(true);
		expect(complete.body.email).toMatchObject({ status: "sent" });
	});

	it("returns 404 for an unknown session identifier without leaking internals", async () => {
		const response = await request(app).get("/forms/does-not-exist");

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ error: "not found" });
	});
});

describe("POST /retry/:sessionId", () => {
	it("reprocesses a single failed form", async () => {
		forceProvider("geocode", "failure", 0);
		const form = makeIngestedForm();
		const { body } = await request(app).post("/ingest").send(form);
		await processIngest(body.id);

		const beforeRetry = await request(app).get(`/forms/${form.session_id}`);
		expect(beforeRetry.body.status).toBe("failed_transient");

		forceProvider("geocode", "success", 0);
		const retry = await request(app).post(`/retry/${form.session_id}`);

		expect(retry.status).toBe(200);
		expect(retry.body.status).toBe("complete");
	});

	it("returns 404 when retrying an unknown session identifier", async () => {
		const response = await request(app).post("/retry/nope");
		expect(response.status).toBe(404);
	});
});

describe("POST /retry", () => {
	it("reprocesses every currently-failed form in one call", async () => {
		forceProvider("geocode", "failure", 0);
		const one = makeIngestedForm();
		const two = makeIngestedForm();
		const r1 = await request(app).post("/ingest").send(one);
		const r2 = await request(app).post("/ingest").send(two);
		await processIngest(r1.body.id);
		await processIngest(r2.body.id);

		forceProvider("geocode", "success", 0);
		const bulk = await request(app).post("/retry");

		expect(bulk.status).toBe(200);
		expect(bulk.body.retried).toBe(2);
		expect((await request(app).get(`/forms/${one.session_id}`)).body.status).toBe("complete");
		expect((await request(app).get(`/forms/${two.session_id}`)).body.status).toBe("complete");
	});
});
