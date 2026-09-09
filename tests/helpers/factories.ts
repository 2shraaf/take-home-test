import { randomUUID } from "node:crypto";
import type { IngestedFormSchema } from "../../src/forms/schemas/ingested_schema";

let sequence = 0;

/** A valid ingested payload with a unique session_id/application_reference each call. */
export const makeIngestedForm = (
	overrides: Partial<IngestedFormSchema> = {},
): IngestedFormSchema => {
	sequence += 1;
	return {
		session_id: `session-${sequence}-${randomUUID()}`,
		application_reference: `APP-${sequence}-${randomUUID()}`,
		name: "John Doe",
		email: "john.doe@example.com",
		gender: "male",
		date_of_birth: "1990-01-01",
		phone_number: "07123456789",
		mobile_number: "07123456789",
		address: {
			address_line_1: "Stratford Village Surgery",
			address_line_2: "50C Romford Road",
			address_line_3: "London",
			postcode: "E15 4BZ",
			country: "United Kingdom",
		},
		...overrides,
	};
};
