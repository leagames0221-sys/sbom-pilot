/**
 * Provider barrel + selection.
 *
 * The CLI calls `createProvider()` with the user-supplied provider
 * name (from `--provider` or `SBOM_PILOT_LLM_PROVIDER`). Default
 * (unset / 'mock') returns the mock provider; 'ollama' returns the
 * local HTTP client; 'anthropic' / 'openai' route through the paid
 * stub which itself routes through the 6-layer defense.
 *
 * AC-NF-5: the default is `mock`. The function falls back to mock on
 * any unrecognised provider name so a typo never silently activates
 * a paid path.
 *
 * Per ADR-0006 §Decision: this barrel re-exports the provider
 * implementations and the defense helpers + types. CLI (Layer 5)
 * imports only through this file.
 *
 * Spec mapping: AC-NF-1, AC-NF-2, AC-NF-3, AC-NF-4, AC-NF-5, ADR-0006.
 */
import { MockProvider } from './mock.js';
import { OllamaProvider } from './ollama.js';
import { PaidStubProvider } from './paid-stub.js';
import type { LlmProvider, ProviderName } from './types.js';
import type { PaidProviderConfig } from './paid-defense.js';

export type { LlmProvider, LlmRequest, LlmResponse, ProviderName } from './types.js';
export type { PaidProviderConfig, ReserveState, PreflightCharge } from './paid-defense.js';
export {
  assertNotCiAutoCall,
  constructorGate,
  maskApiKey,
  newReserveState,
  PaidDefenseError,
  preflightReserve,
} from './paid-defense.js';
export { MockProvider } from './mock.js';
export { OllamaProvider } from './ollama.js';
export { PaidStubProvider } from './paid-stub.js';

/**
 * The pricing / ceiling defaults applied to a paid provider when the
 * CLI does not pass an explicit override. Conservative on purpose: a
 * single accidental run cannot exceed the dollar / token / request
 * cap by more than a small fixed amount.
 */
export const PAID_DEFAULT_CONFIGS: Readonly<
  Record<'anthropic' | 'openai', PaidProviderConfig>
> = {
  anthropic: {
    providerName: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    tokenLimit: 100_000,
    requestLimit: 50,
    costLimitUsd: 1.0,
  },
  openai: {
    providerName: 'openai',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    tokenLimit: 100_000,
    requestLimit: 50,
    costLimitUsd: 1.0,
  },
};

export interface CreateProviderOptions {
  env?: NodeJS.ProcessEnv;
}

/**
 * Construct the LLM provider matching `name`. Unset / unrecognised
 * names default to {@link MockProvider} so a typo never silently
 * activates a paid path.
 *
 * Paid providers ('anthropic' / 'openai') pass through the
 * paid-stub which itself goes through the 4 structural defense layers
 * in `paid-defense.ts`. The constructor throws PaidDefenseError when
 * the env-var opt-in is incomplete.
 */
export function createProvider(
  name: string | undefined,
  options: CreateProviderOptions = {},
): LlmProvider {
  const env = options.env ?? process.env;
  const resolved = (name ?? env['SBOM_PILOT_LLM_PROVIDER'] ?? 'mock').toLowerCase();

  switch (resolved as ProviderName | string) {
    case 'mock':
      return new MockProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'anthropic':
      return new PaidStubProvider({
        config: PAID_DEFAULT_CONFIGS.anthropic,
        env,
      });
    case 'openai':
      return new PaidStubProvider({
        config: PAID_DEFAULT_CONFIGS.openai,
        env,
      });
    default:
      // Typo / unknown name → mock fallback. No silent paid activation.
      return new MockProvider();
  }
}
