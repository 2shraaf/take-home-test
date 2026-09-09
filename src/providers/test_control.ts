/**
 * Test-only control seam for the simulated external providers.
 *
 * Production code paths never call `forceProvider`, so with no override in place
 * the providers behave exactly as before — a realistic ~5% random failure rate
 * and a 1s latency. Tests call `forceProvider("geocode", "failure")` etc. to make
 * both the success path and the exhausted-retry path deterministic.
 */
export type ProviderName = "geocode" | "email";
export type ProviderOutcome = "success" | "failure";

type Override = { outcome: ProviderOutcome; delayMs: number };

const overrides = new Map<ProviderName, Override>();

export const forceProvider = (name: ProviderName, outcome: ProviderOutcome, delayMs = 0): void => {
	overrides.set(name, { outcome, delayMs });
};

export const resetProviders = (name?: ProviderName): void => {
	if (name) {
		overrides.delete(name);
		return;
	}
	overrides.clear();
};

/**
 * Resolve what a provider call should do: the forced override if a test set one,
 * otherwise the real (randomly flaky) behaviour. Shared so both providers make
 * the identical decision rather than duplicating it.
 */
export const resolveProviderBehaviour = (
	name: ProviderName,
	realDelayMs: number,
	realSuccessRate: number,
): { success: boolean; delayMs: number } => {
	const override = overrides.get(name);
	return {
		success: override ? override.outcome === "success" : Math.random() < realSuccessRate,
		delayMs: override ? override.delayMs : realDelayMs,
	};
};
