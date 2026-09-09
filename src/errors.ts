/** Narrow an unknown thrown value to a human-readable string. */
export const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
