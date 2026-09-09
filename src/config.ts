import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });

export type AppConfig = {
	databasePath: string;
	databaseEncryptionKey: string;
	port: number;
	retryMaxAttempts: number;
	retryBaseDelayMs: number;
	sweepIntervalMs: number;
	/** How long a row may sit `processing` before a sweep reclaims it as crashed. */
	staleLockMs: number;
	/**
	 * Whether a successful ingest immediately kicks the consumer. True in
	 * production; tests set it false and drive `processIngest`/`runSweep` directly
	 * so integration tests are deterministic instead of racing the async trigger.
	 */
	autoTriggerConsumer: boolean;
};

const requireEnv = (name: string): string => {
	const value = process.env[name];
	if (value === undefined || value === "") {
		throw new Error(`Missing required environment variable ${name}. See README.md for setup.`);
	}
	return value;
};

const numberEnv = (name: string, fallback: number): number => {
	const raw = process.env[name];
	if (raw === undefined || raw === "") {
		return fallback;
	}
	const parsed = Number(raw);
	if (Number.isNaN(parsed)) {
		throw new Error(`Environment variable ${name} must be a number, got "${raw}".`);
	}
	return parsed;
};

const boolEnv = (name: string, fallback: boolean): boolean => {
	const raw = process.env[name];
	if (raw === undefined || raw === "") {
		return fallback;
	}
	return raw === "true" || raw === "1";
};

export const loadConfig = (): AppConfig => ({
	databasePath: process.env.DB_PATH ?? "./data/forms.db",
	databaseEncryptionKey: requireEnv("DB_ENCRYPTION_KEY"),
	port: numberEnv("PORT", 3000),
	retryMaxAttempts: numberEnv("RETRY_MAX_ATTEMPTS", 3),
	retryBaseDelayMs: numberEnv("RETRY_BASE_DELAY_MS", 200),
	sweepIntervalMs: numberEnv("SWEEP_INTERVAL_MS", 5000),
	staleLockMs: numberEnv("STALE_LOCK_MS", 30000),
	autoTriggerConsumer: boolEnv("AUTO_TRIGGER_CONSUMER", true),
});
