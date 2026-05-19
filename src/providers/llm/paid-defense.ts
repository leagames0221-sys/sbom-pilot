/**
 * Paid-API 6-layer defense scaffolding.
 *
 * sbom-pilot's hard constraint is "no surprise network calls and no
 * surprise credit-card charges". This module implements the four
 * structural defenses that any paid LLM provider (Anthropic, OpenAI,
 * etc.) must pass through before reaching `fetch()`. Layers 5 and 6
 * (default = mock; no-credit-card-service) are enforced elsewhere
 * (the provider index file picks mock when no explicit opt-in; the
 * project rule banning credit-card services is enforced by review).
 *
 * Per ADR-0006 §Decision: this module is a leaf provider helper. It
 * has no dependencies on the other LLM provider files so the defense
 * keeps holding even if a future contributor renames or moves things.
 *
 * Spec mapping: AC-NF-1, AC-NF-2, AC-NF-3, AC-NF-4, AC-NF-5, AC-NF-6,
 * ADR-0005, ADR-0006.
 */

/**
 * Per-provider configuration block. The CLI-layer wiring (T-31)
 * constructs one of these per paid provider it supports.
 */
export interface PaidProviderConfig {
  /** e.g. 'anthropic' / 'openai'. Used in error messages and the second-factor env-var check. */
  providerName: string;
  /** e.g. 'ANTHROPIC_API_KEY'. */
  apiKeyEnvVar: string;
  /** Maximum tokens per process before the reserve is poisoned. */
  tokenLimit: number;
  /** Maximum API requests per process. */
  requestLimit: number;
  /** Maximum USD cost per process. */
  costLimitUsd: number;
}

/**
 * Layer-2 budget state. Carried in-memory across calls within one
 * CLI invocation. `poisoned = true` is sticky — once a ceiling is
 * exceeded, no further calls are permitted even if subsequent
 * requests would individually fit.
 */
export interface ReserveState {
  tokensUsed: number;
  requestsUsed: number;
  costUsedUsd: number;
  poisoned: boolean;
}

export function newReserveState(): ReserveState {
  return {
    tokensUsed: 0,
    requestsUsed: 0,
    costUsedUsd: 0,
    poisoned: false,
  };
}

/**
 * Error thrown by every layer in the defense. Carries a category so
 * the CLI can map to distinct exit codes if it wants (right now they
 * all surface the same EX_NOPERM).
 */
export class PaidDefenseError extends Error {
  readonly layer: 'constructor' | 'reserve' | 'ci-ban' | 'mask';
  constructor(layer: PaidDefenseError['layer'], message: string) {
    super(message);
    this.name = 'PaidDefenseError';
    this.layer = layer;
  }
}

/**
 * Layer 1 — Constructor gate.
 *
 * A paid-provider constructor is allowed to run only when BOTH:
 *   - `<config.apiKeyEnvVar>` is set to a non-empty string
 *   - `SBOM_PILOT_LLM_PROVIDER` is set to exactly `config.providerName`
 *
 * The double-factor is deliberate: the API-key var alone would be
 * caught by users who copy-paste an `.envrc` and accidentally drag in
 * a provider key; requiring an explicit per-tool opt-in stops that
 * accidental activation. Returns the API key on success; throws
 * PaidDefenseError otherwise.
 *
 * `env` is injectable for tests so they can drive the gate without
 * touching the host `process.env` for the whole test file.
 */
export function constructorGate(
  config: PaidProviderConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = env[config.apiKeyEnvVar];
  if (key === undefined || key.length === 0) {
    throw new PaidDefenseError(
      'constructor',
      `Paid provider ${config.providerName} is blocked: ${config.apiKeyEnvVar} is not set. Set the key AND SBOM_PILOT_LLM_PROVIDER=${config.providerName} to opt in.`,
    );
  }
  const optIn = env['SBOM_PILOT_LLM_PROVIDER'];
  if (optIn !== config.providerName) {
    throw new PaidDefenseError(
      'constructor',
      `Paid provider ${config.providerName} is blocked: SBOM_PILOT_LLM_PROVIDER must be exactly "${config.providerName}" (got: ${optIn ?? 'undefined'}).`,
    );
  }
  return key;
}

export interface PreflightCharge {
  tokens: number;
  costUsd: number;
}

/**
 * Layer 2 — Pre-flight reserve.
 *
 * Before each paid call the caller submits the projected charge.
 * If admitting the charge would cross ANY of the three ceilings the
 * reserve flips to `poisoned = true` and PaidDefenseError is thrown.
 * The state is otherwise updated and returned.
 *
 * Once poisoned, all subsequent calls throw — the typical recovery
 * path is to exit the process (the CLI maps this to EX_TEMPFAIL when
 * appropriate).
 */
export function preflightReserve(
  state: ReserveState,
  charge: PreflightCharge,
  config: PaidProviderConfig,
): ReserveState {
  if (state.poisoned) {
    throw new PaidDefenseError(
      'reserve',
      `Paid provider ${config.providerName} reserve is poisoned; all subsequent calls blocked. Restart the process to recover.`,
    );
  }
  const nextTokens = state.tokensUsed + charge.tokens;
  const nextRequests = state.requestsUsed + 1;
  const nextCost = state.costUsedUsd + charge.costUsd;

  if (nextTokens > config.tokenLimit) {
    throw new PaidDefenseError(
      'reserve',
      `Paid provider ${config.providerName} token ceiling (${config.tokenLimit}) exceeded by this call (${nextTokens} requested). Reserve poisoned.`,
    );
  }
  if (nextRequests > config.requestLimit) {
    throw new PaidDefenseError(
      'reserve',
      `Paid provider ${config.providerName} request-count ceiling (${config.requestLimit}) exceeded. Reserve poisoned.`,
    );
  }
  if (nextCost > config.costLimitUsd) {
    throw new PaidDefenseError(
      'reserve',
      `Paid provider ${config.providerName} cost ceiling (USD ${config.costLimitUsd}) exceeded by this call (USD ${nextCost.toFixed(4)}). Reserve poisoned.`,
    );
  }
  return {
    tokensUsed: nextTokens,
    requestsUsed: nextRequests,
    costUsedUsd: nextCost,
    poisoned: false,
  };
}

/**
 * Layer 3 — Key non-leak.
 *
 * Render an API key for inclusion in log lines, error messages, and
 * telemetry without exposing the secret. Keeps the first six chars
 * (provider-prefix is conventionally identifiable: `sk-ant-`, `sk-`,
 * etc.) and replaces the body with the same number of `*` characters
 * so the rendered length still carries some signal but the secret is
 * not recoverable.
 *
 * Keys ≤ 6 chars are rendered as `***` (entire key suppressed) — they
 * are almost certainly malformed, but on the rare chance they are
 * real, the conservative path is to leak nothing.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 6) return '***';
  const prefix = key.slice(0, 6);
  return `${prefix}${'*'.repeat(key.length - 6)}`;
}

/**
 * Layer 4 — CI auto-call ban.
 *
 * Throws when invoked in a CI environment (`CI=true` per the de-facto
 * GitHub Actions / GitLab CI convention) UNLESS the test bypass flag
 * `SBOM_PILOT_TEST_ALLOW_PAID=1` is also set. T-28 wires the unstubbed
 * `fetch` trap that asserts no CLI subcommand reaches the network on
 * default invocations; this function is the structural gate that the
 * paid provider's `suggest()` call goes through, so a test that
 * forgets to stub fetch will still fail loudly.
 */
export function assertNotCiAutoCall(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const ci = env['CI'];
  if (ci !== 'true' && ci !== '1') return;
  const allow = env['SBOM_PILOT_TEST_ALLOW_PAID'];
  if (allow === '1') return;
  throw new PaidDefenseError(
    'ci-ban',
    'Paid provider blocked: CI environment detected (CI=true). Set SBOM_PILOT_TEST_ALLOW_PAID=1 only in a sandboxed CI step that explicitly exercises the paid path.',
  );
}
