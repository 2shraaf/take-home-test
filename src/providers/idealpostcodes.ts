import { HttpResponse } from "./httpresponse";
import { resolveProviderBehaviour } from "./test_control";

const REAL_DELAY_MS = 1000;
const REAL_SUCCESS_RATE = 0.95;

export const lookupPostcode = async (
	postcode: string,
): Promise<HttpResponse<{ longitude: number; latitude: number }>> => {
	const { success, delayMs } = resolveProviderBehaviour("geocode", REAL_DELAY_MS, REAL_SUCCESS_RATE);

	// Simulating an asynchronous operation, e.g., looking up a postcode
	await new Promise((resolve) => setTimeout(resolve, delayMs));

	return {
		statusCode: success ? 200 : 500,
		body: success ? { longitude: 50.05, latitude: -5.05 } : undefined,
	};
};
