import { HttpResponse } from "./httpresponse";
import { resolveProviderBehaviour } from "./test_control";

const REAL_DELAY_MS = 1000;
const REAL_SUCCESS_RATE = 0.95;

export const sendEmail = async ({
	to,
	from,
	subject,
	body,
}: {
	to: string;
	from: string;
	subject: string;
	body: string;
}): Promise<HttpResponse<void>> => {
	void to;
	void from;
	void subject;
	void body;

	const { success, delayMs } = resolveProviderBehaviour("email", REAL_DELAY_MS, REAL_SUCCESS_RATE);

	// Simulating an asynchronous operation, e.g., sending an email
	await new Promise((resolve) => setTimeout(resolve, delayMs));

	return {
		statusCode: success ? 200 : 500,
		body: undefined,
	};
};
