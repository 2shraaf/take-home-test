import type { IngestedFormSchema } from "./schemas/ingested_schema";
import type { TransformedFormSchema } from "./schemas/transformed_schema";

/**
 * The transform stage's contract is written down in docs/transform-contract.md.
 * These functions are the runtime implementation of it — pure, so they can be
 * unit-tested directly on input/output pairs.
 */

export type NameParts = {
	firstName: string;
	lastName: string;
	/** True when `name` had no whitespace — a documented, pragmatic limitation, not a failure. */
	flagged: boolean;
};

/**
 * Splits on the LAST whitespace boundary: everything after the final space is
 * the surname, the rest is the given name. A name with no whitespace becomes
 * given-name-only with an empty surname and is flagged for review, never failed.
 */
export const splitName = (name: string): NameParts => {
	const trimmed = name.trim();
	const lastSpace = trimmed.search(/\s\S*$/);
	if (lastSpace === -1) {
		return { firstName: trimmed, lastName: "", flagged: true };
	}
	return {
		firstName: trimmed.slice(0, lastSpace).trim(),
		lastName: trimmed.slice(lastSpace + 1).trim(),
		flagged: false,
	};
};

/** `"other"` → `"prefer-not-to-say"`; `"male"`/`"female"` pass through unchanged. */
export const mapGender = (gender: IngestedFormSchema["gender"]): TransformedFormSchema["gender"] =>
	gender === "other" ? "prefer-not-to-say" : gender;

export class MalformedDateError extends Error {
	constructor(public readonly value: string) {
		super(`Malformed date_of_birth: ${JSON.stringify(value)}`);
		this.name = "MalformedDateError";
	}
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Parses an ISO 8601 `date_of_birth` string into a `Date`. A string that is not
 * ISO-shaped, or that does not resolve to a real calendar date, throws
 * {@link MalformedDateError} — it is never silently coerced to `Invalid Date`.
 */
export const parseDateOfBirth = (value: string): Date => {
	const trimmed = value.trim();
	if (!ISO_DATE.test(trimmed)) {
		throw new MalformedDateError(value);
	}
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		throw new MalformedDateError(value);
	}
	// For a bare YYYY-MM-DD (the expected DOB shape), `new Date` parses as UTC
	// midnight, so a rolled-over value like 2021-02-30 -> 2021-03-02 is caught by
	// requiring the date to round-trip. Datetime strings with an offset can
	// legitimately land on a different UTC day, so the check applies to date-only.
	if (ISO_DATE_ONLY.test(trimmed) && parsed.toISOString().slice(0, 10) !== trimmed) {
		throw new MalformedDateError(value);
	}
	return parsed;
};

export type FlatAddress = {
	addressLine1: string;
	addressLine2: string;
	addressLine3: string | undefined;
	postcode: string;
	country: string;
};

/** Flattens the nested address to top-level fields — a 1:1 mapping, nothing more. */
export const flattenAddress = (address: IngestedFormSchema["address"]): FlatAddress => ({
	addressLine1: address.address_line_1,
	addressLine2: address.address_line_2,
	addressLine3: address.address_line_3,
	postcode: address.postcode,
	country: address.country,
});

/**
 * The full transform, minus geocoding: `longitude`/`latitude` are added by the
 * consumer once the geocoding provider answers. `nameFlagged` surfaces the
 * single-token-name case so the consumer can persist it on the form.
 */
export type TransformResult = Omit<TransformedFormSchema, "longitude" | "latitude"> & {
	nameFlagged: boolean;
};

export const transformForm = (input: IngestedFormSchema): TransformResult => {
	const { firstName, lastName, flagged } = splitName(input.name);
	return {
		sessionId: input.session_id,
		applicationReference: input.application_reference,
		firstName,
		lastName,
		nameFlagged: flagged,
		email: input.email,
		gender: mapGender(input.gender),
		dateOfBirth: parseDateOfBirth(input.date_of_birth),
		phoneNumber: input.phone_number,
		mobileNumber: input.mobile_number,
		...flattenAddress(input.address),
	};
};
