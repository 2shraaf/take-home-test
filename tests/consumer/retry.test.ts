import { RetryExhaustedError, withRetry } from "../../src/consumer/retry";
import type { HttpResponse } from "../../src/providers/httpresponse";

const ok: HttpResponse<{ value: number }> = { statusCode: 200, body: { value: 1 } };
const serverError: HttpResponse<{ value: number }> = { statusCode: 500, body: undefined };

describe("withRetry", () => {
	it("returns the first successful response without retrying", async () => {
		const operation = jest.fn(async () => ok);
		const result = await withRetry(operation, { maxAttempts: 3, baseDelayMs: 0 });

		expect(result).toBe(ok);
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it("retries a failing operation up to maxAttempts, then throws RetryExhaustedError", async () => {
		const operation = jest.fn(async () => serverError);

		await expect(withRetry(operation, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toBeInstanceOf(
			RetryExhaustedError,
		);
		expect(operation).toHaveBeenCalledTimes(3);
	});

	it("recovers when a later attempt succeeds", async () => {
		const operation = jest
			.fn<Promise<HttpResponse<{ value: number }>>, []>()
			.mockResolvedValueOnce(serverError)
			.mockResolvedValueOnce(ok);

		const result = await withRetry(operation, { maxAttempts: 3, baseDelayMs: 0 });

		expect(result).toBe(ok);
		expect(operation).toHaveBeenCalledTimes(2);
	});

	it("retries when the operation throws rather than returning a 5xx", async () => {
		const operation = jest.fn(async () => {
			throw new Error("connection reset");
		});

		await expect(withRetry(operation, { maxAttempts: 2, baseDelayMs: 0 })).rejects.toThrow(
			/connection reset/,
		);
		expect(operation).toHaveBeenCalledTimes(2);
	});

	it("reports each retry through the onRetry callback", async () => {
		const operation = jest.fn(async () => serverError);
		const onRetry = jest.fn();

		await expect(
			withRetry(operation, { maxAttempts: 3, baseDelayMs: 0, onRetry }),
		).rejects.toBeInstanceOf(RetryExhaustedError);

		expect(onRetry).toHaveBeenCalledTimes(2); // fires before attempts 2 and 3, not after the last
	});
});
