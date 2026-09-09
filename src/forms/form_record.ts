import type { forms } from "../db/schema";
import type { TransformResult } from "./transform";

type FormInsert = typeof forms.$inferInsert;

/**
 * Maps a {@link TransformResult} plus the geocoding output onto a `forms` row.
 * Keeps the form-shape knowledge next to the transform/schema rather than inside
 * the consumer. The email obligation starts `pending` in this same object, so it
 * is written in the one INSERT that creates the form.
 */
export const buildFormRow = (
	transformed: TransformResult,
	extras: { ingestId: string; formId: string; longitude: number; latitude: number; timestamp: number },
): FormInsert => ({
	id: extras.formId,
	ingestId: extras.ingestId,
	sessionId: transformed.sessionId,
	applicationReference: transformed.applicationReference,
	firstName: transformed.firstName,
	lastName: transformed.lastName,
	nameFlagged: transformed.nameFlagged,
	email: transformed.email,
	gender: transformed.gender,
	dateOfBirth: transformed.dateOfBirth,
	phoneNumber: transformed.phoneNumber ?? null,
	mobileNumber: transformed.mobileNumber,
	addressLine1: transformed.addressLine1,
	addressLine2: transformed.addressLine2,
	addressLine3: transformed.addressLine3 ?? null,
	postcode: transformed.postcode,
	country: transformed.country,
	longitude: extras.longitude,
	latitude: extras.latitude,
	emailStatus: "pending",
	createdAt: extras.timestamp,
	updatedAt: extras.timestamp,
});
