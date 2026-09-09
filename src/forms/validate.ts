import { z } from "zod";
import type { IngestedFormSchema } from "./schemas/ingested_schema";
import { parseDateOfBirth } from "./transform";

/**
 * Runtime shape of the currently-agreed ingested schema (ingested_schema.ts).
 * Extra fields the third party might add are ignored; missing or wrong-typed
 * required fields are a `failed_validation`. `date_of_birth` must parse to a real
 * calendar date here — a malformed date is caught at validation, never passed on.
 */
const isParseableDate = (value: string): boolean => {
	try {
		parseDateOfBirth(value);
		return true;
	} catch {
		return false;
	}
};

export const ingestedFormSchema = z.object({
	session_id: z.string().min(1),
	application_reference: z.string().min(1),
	name: z.string().min(1),
	email: z.string().min(1),
	gender: z.enum(["male", "female", "other"]),
	date_of_birth: z.string().refine(isParseableDate, { message: "date_of_birth is not a valid ISO 8601 date" }),
	phone_number: z.string().optional(),
	mobile_number: z.string().min(1),
	address: z.object({
		address_line_1: z.string().min(1),
		address_line_2: z.string().min(1),
		address_line_3: z.string().optional(),
		postcode: z.string().min(1),
		country: z.string().min(1),
	}),
});

export type ValidationResult =
	| { ok: true; value: IngestedFormSchema }
	| { ok: false; error: string };

/** Validates a raw payload against the agreed schema without ever throwing. */
export const validateIngestedForm = (payload: unknown): ValidationResult => {
	const result = ingestedFormSchema.safeParse(payload);
	if (result.success) {
		return { ok: true, value: result.data as IngestedFormSchema };
	}
	const summary = result.error.issues
		.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
		.join("; ");
	return { ok: false, error: summary };
};
