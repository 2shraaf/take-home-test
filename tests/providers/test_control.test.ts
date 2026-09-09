import { lookupPostcode } from "../../src/providers/idealpostcodes";
import { sendEmail } from "../../src/providers/sendgrid";
import { forceProvider, resetProviders } from "../../src/providers/test_control";

afterEach(() => resetProviders());

describe("geocoding provider test seam", () => {
	it("can be forced to succeed on demand", async () => {
		forceProvider("geocode", "success");
		const response = await lookupPostcode("E15 4BZ");
		expect(response.statusCode).toBe(200);
		expect(response.body).toEqual({ longitude: 50.05, latitude: -5.05 });
	});

	it("can be forced to fail on demand", async () => {
		forceProvider("geocode", "failure");
		const response = await lookupPostcode("E15 4BZ");
		expect(response.statusCode).toBe(500);
		expect(response.body).toBeUndefined();
	});

	it("can have its artificial delay eliminated", async () => {
		forceProvider("geocode", "success", 0);
		const start = Date.now();
		await lookupPostcode("E15 4BZ");
		// The real provider sleeps 1000ms; with the override at 0 it must return
		// well inside that even on a busy event loop.
		expect(Date.now() - start).toBeLessThan(900);
	});
});

describe("email provider test seam", () => {
	it("can be forced to succeed on demand", async () => {
		forceProvider("email", "success");
		const response = await sendEmail({ to: "a@b.com", from: "c@d.com", subject: "s", body: "b" });
		expect(response.statusCode).toBe(200);
	});

	it("can be forced to fail on demand", async () => {
		forceProvider("email", "failure");
		const response = await sendEmail({ to: "a@b.com", from: "c@d.com", subject: "s", body: "b" });
		expect(response.statusCode).toBe(500);
	});

	it("can have its artificial delay eliminated", async () => {
		forceProvider("email", "success", 0);
		const start = Date.now();
		await sendEmail({ to: "a@b.com", from: "c@d.com", subject: "s", body: "b" });
		expect(Date.now() - start).toBeLessThan(900);
	});
});

describe("production behaviour", () => {
	it("is unchanged when no override is set — still randomly flaky, not always-success", async () => {
		// With no override the outcome is Math.random()-based. Over many calls we
		// expect mostly successes and at least one failure, i.e. not forced.
		const outcomes = await Promise.all(
			Array.from({ length: 400 }, () => lookupPostcode("E15 4BZ").then((r) => r.statusCode)),
		);
		const failures = outcomes.filter((code) => code === 500).length;
		expect(failures).toBeGreaterThan(0);
		expect(failures).toBeLessThan(outcomes.length);
	});
});
