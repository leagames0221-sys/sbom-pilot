/**
 * Ollama LLM provider — local-only HTTP client.
 *
 * Ollama serves models like `gemma3:4b` over a localhost HTTP API
 * (default port 11434, no auth). It runs entirely on the user's
 * machine, consumes no paid API quota, and the executable itself is
 * free + open source — no credit card or signup required (AC-NF-6).
 *
 * The constructor accepts a `baseUrl` override so tests can point at
 * a stub HTTP server; in production the CLI uses the default
 * localhost endpoint.
 *
 * Per AC-NF-5: when the user passes `SBOM_PILOT_LLM_PROVIDER=ollama`
 * the provider index routes here; otherwise the default mock provider
 * is used. The Ollama provider does NOT touch the paid-defense
 * 6-layer scaffolding — only paid providers (Anthropic / OpenAI) do.
 *
 * Spec mapping: AC-NF-5, AC-NF-6, ADR-0006.
 */
import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';

interface OllamaApiResponse {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaProviderOptions {
  /** Default 'gemma3:4b' — small enough to run on a consumer laptop. */
  model?: string;
  /** Default 'http://localhost:11434'. Override for tests. */
  baseUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama' as const;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OllamaProviderOptions = {}) {
    this.model = options.model ?? 'gemma3:4b';
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async suggest(request: LlmRequest): Promise<LlmResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt: request.prompt,
      stream: false,
    };
    if (request.maxTokens !== undefined) {
      body['options'] = { num_predict: request.maxTokens };
    }
    const res = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `Ollama HTTP ${res.status} ${res.statusText} — is the Ollama daemon running on ${this.baseUrl}? (Hint: \`ollama serve\` + \`ollama pull ${this.model}\`)`,
      );
    }
    const json = (await res.json()) as OllamaApiResponse;
    const text = json.response ?? '';
    const tokens = (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0);
    return {
      text,
      tokensConsumed: tokens,
      costUsd: 0,
      provider: 'ollama',
    };
  }
}
