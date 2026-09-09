import { getDb } from "../../src/db/client";
import { forms, rawIngests } from "../../src/db/schema";

/** Empty both tables between tests sharing the in-memory database in one file. */
export const resetDb = (): void => {
	const db = getDb();
	db.delete(forms).run();
	db.delete(rawIngests).run();
};
