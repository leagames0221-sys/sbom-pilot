/**
 * Mock LLM provider — the default provider when no explicit opt-in.
 *
 * Returns deterministic, canned suggestion text without making any
 * network call. The CLI uses this by default so the `suggest`
 * subcommand (T-31) is functional out of the box even when no Ollama
 * is running and no paid API is configured.
 *
 * Per AC-NF-5: mock is the default provider returned by the index
 * module when `SBOM_PILOT_LLM_PROVIDER` is unset.
 *
 * Spec mapping: AC-NF-5, ADR-0006.
 */
import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';

export class MockProvider implements LlmProvider {
  readonly name = 'mock' as const;

  async suggest(request: LlmRequest): Promise<LlmResponse> {
    const summary = request.prompt.slice(0, 80).replace(/\s+/g, ' ').trim();
    return {
      text:
        `[mock provider] No live LLM was queried. ` +
        `Prompt summary: ${summary}${request.prompt.length > 80 ? '…' : ''}`,
      tokensConsumed: 0,
      costUsd: 0,
      provider: 'mock',
    };
  }
}
