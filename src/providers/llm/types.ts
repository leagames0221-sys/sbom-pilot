/**
 * Shared interface and types for the LLM provider layer (mock / Ollama
 * / paid).
 *
 * Per ADR-0006 §Decision: leaf cross-cutting module. Importable by
 * Layer 4 emitters that produce remediation suggestions; not imported
 * by parsers / scanners / CLI directly (CLI imports through the
 * provider index barrel).
 *
 * Spec mapping: ADR-0005, ADR-0006.
 */

export type ProviderName = 'mock' | 'ollama' | 'anthropic' | 'openai';

export interface LlmRequest {
  prompt: string;
  /**
   * Maximum tokens the caller is willing to pay for. Provider impls
   * may interpret this as a hard cap, a soft hint, or both — the
   * paid-defense module's pre-flight reserve enforces the project-wide
   * ceiling separately.
   */
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  tokensConsumed: number;
  /**
   * Estimated USD cost of the call. Free providers (mock, Ollama)
   * report 0. Paid providers compute from token usage + provider
   * pricing.
   */
  costUsd: number;
  provider: ProviderName;
}

export interface LlmProvider {
  readonly name: ProviderName;
  suggest(request: LlmRequest): Promise<LlmResponse>;
}
