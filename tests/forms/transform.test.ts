import {
	MalformedDateError,
	flattenAddress,
	mapGender,
	parseDateOfBirth,
	splitName,
	transformForm,
} from "../../src/forms/transform";
import type { IngestedFormSchema } from "../../src/forms/schemas/ingested_schema";

describe("splitName", () => {
	it("splits on the last whitespace boundary: everything after is the surname", () => {
		expect(splitName("Anna Van Der Berg")).toEqual({
			firstName: "Anna Van Der",
			lastName: "Berg",
			flagged: false,
		});
	});

	it("handles a simple two-token name", () => {
		expect(splitName("John Doe")).toEqual({ firstName: "John", lastName: "Doe", flagged: false });
	});

	it("treats a single-token name as given-name-only with an empty surname, and flags it", () => {
		expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "", flagged: true });
	});

	it("does not fail on a single-token name — it is flagged, not rejected", () => {
		expect(() => splitName("Prince")).not.toThrow();
	});
});

describe("mapGender", () => {
	it("passes male through unchanged", () => {
		expect(mapGender("male")).toBe("male");
	});

	it("passes female through unchanged", () => {
		expect(mapGender("female")).toBe("female");
	});

	it("maps other to prefer-not-to-say", () => {
		expect(mapGender("other")).toBe("prefer-not-to-say");
	});
});

describe("parseDateOfBirth", () => {
	it("parses an ISO 8601 date string into a Date", () => {
		const parsed = parseDateOfBirth("1990-01-01");
		expect(parsed).toBeInstanceOf(Date);
		expect(parsed.getUTCFullYear()).toBe(1990);
		expect(parsed.getUTCMonth()).toBe(0);
		expect(parsed.getUTCDate()).toBe(1);
	});

	it("throws MalformedDateError on a non-date string", () => {
		expect(() => parseDateOfBirth("not-a-date")).toThrow(MalformedDateError);
	});

	it("throws MalformedDateError on an impossible calendar date", () => {
		expect(() => parseDateOfBirth("2021-13-45")).toThrow(MalformedDateError);
	});

	it("throws MalformedDateError on a non-ISO format", () => {
		expect(() => parseDateOfBirth("01/01/1990")).toThrow(MalformedDateError);
	});

	it("accepts a valid ISO 8601 datetime with an offset that crosses UTC midnight", () => {
		// 1985-06-20T23:00:00-05:00 is 1985-06-21T04:00Z — a valid instant that
		// lands on a different UTC day; it must not be rejected as malformed.
		expect(() => parseDateOfBirth("1985-06-20T23:00:00-05:00")).not.toThrow();
	});
});

describe("flattenAddress", () => {
	it("flattens the nested address 1:1 with no other transformation", () => {
		expect(
			flattenAddress({
				address_line_1: "Stratford Village Surgery",
				address_line_2: "50C Romford Road",
				address_line_3: "London",
				postcode: "E15 4BZ",
				country: "United Kingdom",
			}),
		).toEqual({
			addressLine1: "Stratford Village Surgery",
			addressLine2: "50C Romford Road",
			addressLine3: "London",
			postcode: "E15 4BZ",
			country: "United Kingdom",
		});
	});

	it("keeps an absent optional address_line_3 as undefined", () => {
		expect(
			flattenAddress({
				address_line_1: "123 Main St",
				address_line_2: "Apt 1",
				address_line_3: undefined,
				postcode: "SW1A 1AA",
				country: "United Kingdom",
			}).addressLine3,
		).toBeUndefined();
	});
});

const baseIngested: IngestedFormSchema = {
	session_id: "s-1",
	application_reference: "APP-1",
	name: "Andy James Smith-Jones",
	email: "andy@example.com",
	gender: "other",
	date_of_birth: "1985-06-20",
	phone_number: undefined,
	mobile_number: "07777777777",
	address: {
		address_line_1: "1 The Avenue",
		address_line_2: "Bristol",
		address_line_3: undefined,
		postcode: "BS1 1AA",
		country: "United Kingdom",
	},
};

describe("transformForm", () => {
	it("applies all rules: name split, gender map, date parse, address flatten", () => {
		const result = transformForm(baseIngested);

		expect(result.sessionId).toBe("s-1");
		expect(result.applicationReference).toBe("APP-1");
		expect(result.firstName).toBe("Andy James");
		expect(result.lastName).toBe("Smith-Jones");
		expect(result.nameFlagged).toBe(false);
		expect(result.gender).toBe("prefer-not-to-say");
		expect(result.dateOfBirth).toBeInstanceOf(Date);
		expect(result.dateOfBirth.getUTCFullYear()).toBe(1985);
		expect(result.addressLine1).toBe("1 The Avenue");
		expect(result.postcode).toBe("BS1 1AA");
		expect(result.phoneNumber).toBeUndefined();
	});

	it("flags a single-token name without failing the transform", () => {
		const result = transformForm({ ...baseIngested, name: "Cher" });
		expect(result.firstName).toBe("Cher");
		expect(result.lastName).toBe("");
		expect(result.nameFlagged).toBe(true);
	});

	it("propagates a malformed date as a MalformedDateError", () => {
		expect(() => transformForm({ ...baseIngested, date_of_birth: "junk" })).toThrow(MalformedDateError);
	});
});
