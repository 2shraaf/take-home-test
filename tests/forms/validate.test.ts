import { validateIngestedForm } from "../../src/forms/validate";
import personOne from "../../src/forms/examples/person_one.json";
import personThree from "../../src/forms/examples/person_three.json";

describe("validateIngestedForm", () => {
	it("accepts a well-formed payload matching the agreed schema", () => {
		const result = validateIngestedForm(personOne);
		expect(result.ok).toBe(true);
	});

	it("accepts a payload that omits the optional fields", () => {
		// person_three has no phone_number and no address_line_3
		const result = validateIngestedForm(personThree);
		expect(result.ok).toBe(true);
	});

	it("rejects a payload missing a required field, capturing an error", () => {
		const { email, ...withoutEmail } = personOne as Record<string, unknown>;
		const result = validateIngestedForm(withoutEmail);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/email/);
		}
	});

	it("rejects a gender value outside the agreed enum", () => {
		const result = validateIngestedForm({ ...personOne, gender: "unspecified" });
		expect(result.ok).toBe(false);
	});

	it("rejects a malformed date_of_birth as a validation failure", () => {
		const result = validateIngestedForm({ ...personOne, date_of_birth: "not-a-date" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/date_of_birth/);
		}
	});

	it("rejects a payload whose nested address drifted to a wrong type", () => {
		const result = validateIngestedForm({ ...personOne, address: "10 Downing Street" });
		expect(result.ok).toBe(false);
	});

	it("rejects a non-object payload without throwing", () => {
		expect(() => validateIngestedForm(null)).not.toThrow();
		expect(validateIngestedForm(null).ok).toBe(false);
	});
});
