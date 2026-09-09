import { messageOf } from "../errors";
import type { HttpResponse } from "../providers/httpresponse";

/**
 * One shared retry-with-backoff helper, used identically for the geocoding call
 * and the email call (spec: both unreliable integrations get the same treatment,
 * not two bespoke implementations).
 */
export type RetryOptions = {
	maxAttempts?: number;
	baseDelayMs?: number;
	/** Called before each re-attempt (not after the final failure) with the 1-based attempt just finished. */
	onRetry?: (attempt: number, error: string) => void;
};

export class RetryExhaustedError extends Error {
	constructor(
		public readonly attempts: number,
		public readonly lastError: string,
	) {
		super(`Operation failed after ${attempts} attempt(s): ${lastError}`);
		this.name = "RetryExhaustedError";
	}
}

/** Exponential backoff for the Nth attempt: `baseDelay * 2^(attempt - 1)`. */
export const backoffDelayMs = (attempt: number, baseDelayMs: number): number =>
	baseDelayMs * 2 ** Math.max(0, attempt - 1);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isSuccess = (statusCode: number): boolean => statusCode >= 200 && statusCode < 300;

export const withRetry = async <T>(
	operation: () => Promise<HttpResponse<T>>,
	options: RetryOptions = {},
): Promise<HttpResponse<T>> => {
	const maxAttempts = options.maxAttempts ?? 3;
	const baseDelayMs = options.baseDelayMs ?? 200;
	let lastError = "unknown error";

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const response = await operation();
			if (isSuccess(response.statusCode)) {
				return response;
			}
			lastError = `HTTP ${response.statusCode}`;
		} catch (error) {
			lastError = messageOf(error);
		}

		if (attempt < maxAttempts) {
			options.onRetry?.(attempt, lastError);
			await sleep(backoffDelayMs(attempt, baseDelayMs));
		}
	}

	throw new RetryExhaustedError(maxAttempts, lastError);
};
