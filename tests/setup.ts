// Test defaults: an in-memory encrypted database, zero retry backoff, and no
// async auto-trigger — so the suite runs with no external infrastructure, no
// real wall-clock waits, and integration tests drive the consumer explicitly
// instead of racing a fire-and-forget promise. Individual tests that need a real
// file on disk (e.g. the encryption-at-rest check) set DB_PATH themselves before
// importing the db client.
process.env.DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY ?? "test-encryption-key-do-not-use-in-prod";
process.env.DB_PATH = process.env.DB_PATH ?? ":memory:";
process.env.RETRY_BASE_DELAY_MS = process.env.RETRY_BASE_DELAY_MS ?? "0";
process.env.SWEEP_INTERVAL_MS = process.env.SWEEP_INTERVAL_MS ?? "60000";
process.env.AUTO_TRIGGER_CONSUMER = process.env.AUTO_TRIGGER_CONSUMER ?? "false";
