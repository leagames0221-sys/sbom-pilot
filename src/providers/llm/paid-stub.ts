/**
 * Paid-provider stub — the only code path that talks to commercial LLM
 * APIs (Anthropic, OpenAI, etc.). Every call routes through the four
 * structural defenses in `paid-defense.ts` BEFORE any `fetch` call.
 *
 * Phase α scope: the actual `fetch(...)` to a paid endpoint is
 * intentionally NOT wired. The constructor + suggest() flow exists so
 * the 6-layer defense can be exercised and audited in isolation, and
 * so a future contributor wiring real Anthropic / OpenAI clients has
 * a single place to do it (this file) without touching the gates.
 *
 * Layers exercised here (per AC-NF-1..4):
 *   1. Constructor gate         (paid-defense.ts:constructorGate)
 *   2. Pre-flight reserve       (paid-defense.ts:preflightReserve)
 *   3. Key non-leak             (paid-defense.ts:maskApiKey on errors)
 *   4. CI auto-call ban         (paid-defense.ts:assertNotCiAutoCall)
 *
 * Layers 5 (default = mock) and 6 (no-credit-card) are enforced
 * elsewhere (index.ts default + project-policy review respectively).
 *
 * Spec mapping: AC-NF-1, AC-NF-2, AC-NF-3, AC-NF-4, ADR-0006.
 */
import type { LlmProvider, LlmRequest, LlmResponse, ProviderName } from './types.js';
import {
  assertNotCiAutoCall,
  constructorGate,
  maskApiKey,
  newReserveState,
  PaidDefenseError,
  preflightReserve,
  type PaidProviderConfig,
  type ReserveState,
} from './paid-defense.js';

export interface PaidStubProviderOptions {
  config: PaidProviderConfig;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

/**
 * Sentinel that the actual paid endpoint has not yet been wired.
 * Future Anthropic / OpenAI wiring lives in this same file; until
 * then any caller that reaches `suggest()` past the 4 gates surfaces
 * this error so the un-wired state is loud, not silent.
 */
const NOT_IMPLEMENTED_MESSAGE =
  'Paid provider transport not wired in Phase α. This file is the only seam where the real fetch() call should be added; do so under the guard of all four defense layers (constructor / reserve / mask / ci-ban).';

export class PaidStubProvider implements LlmProvider {
  readonly name: ProviderName;
  private readonly apiKey: string;
  private readonly config: PaidProviderConfig;
  private readonly env: NodeJS.ProcessEnv;
  private reserve: ReserveState;

  constructor(options: PaidStubProviderOptions) {
    this.config = options.config;
    this.env = options.env ?? process.env;
    // Layer 1 — constructor gate.
    this.apiKey = constructorGate(this.config, this.env);
    this.name = this.config.providerName as ProviderName;
    this.reserve = newReserveState();
  }

  /**
   * Snapshot of the in-memory budget reserve. Exposed so tests can
   * assert state transitions without poking the private field.
   */
  reserveSnapshot(): ReserveState {
    return { ...this.reserve };
  }

  async suggest(request: LlmRequest): Promise<LlmResponse> {
    // Layer 4 — CI auto-call ban. Must come before any branching that
    // could lead to a fetch().
    assertNotCiAutoCall(this.env);

    // Layer 2 — pre-flight reserve. Conservative defaults: 1000 token
    // estimate per call, fractional cost based on declared limit.
    const projectedTokens = request.maxTokens ?? 1000;
    const projectedCost = Math.min(0.01, this.config.costLimitUsd / 100);
    try {
      this.reserve = preflightReserve(
        this.reserve,
        { tokens: projectedTokens, costUsd: projectedCost },
        this.config,
      );
    } catch (e) {
      // Layer 3 — key non-leak. Re-throw with the API key replaced by
      // its masked form so a stack-trace dump does not surface the
      // secret.
      if (e instanceof PaidDefenseError) {
        throw new PaidDefenseError(
          e.layer,
          `${e.message} (API key: ${maskApiKey(this.apiKey)})`,
        );
      }
      throw e;
    }

    // Phase α: transport not wired. Caller hits this only after passing
    // all four gates — the failure is loud-and-localised.
    throw new PaidDefenseError('mask', NOT_IMPLEMENTED_MESSAGE);
  }
}

export { PaidDefenseError };
