import app from "./app";
import { loadConfig } from "./config";
import { startConsumer } from "./consumer/sweep";
import { getDb } from "./db/client";
import { log } from "./log";

const { port } = loadConfig();

// Fail fast: opens the encrypted database and applies migrations. Throws here if
// DB_ENCRYPTION_KEY is missing.
getDb();

// In-process consumer: startup recovery + interval sweep (ADR-0002).
startConsumer();

app.listen(port, () => log("server_started", { port }));
