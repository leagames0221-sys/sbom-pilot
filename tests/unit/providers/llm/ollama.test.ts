/**
 * Unit tests for the Ollama LLM provider (T-27).
 *
 * Uses a stub fetch passed via constructor option so no real HTTP
 * traffic is generated during test runs (AC-NF-4 — see also T-28
 * regression test).
 *
 * Spec mapping: AC-NF-5, AC-NF-6, ADR-0006.
 */
import { describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from '../../../../src/providers/llm/ollama.js';

function stubFetch(
  responseBody: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => responseBody,
  } as Response);
}

describe('OllamaProvider', () => {
  it('POSTs to /api/generate with the configured model + prompt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'ok', eval_count: 12 }),
    } as Response);
    const provider = new OllamaProvider({
      model: 'test-model',
      baseUrl: 'http://stub:11434',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    await provider.suggest({ prompt: 'hello' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('http://stub:11434/api/generate');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('test-model');
    expect(body.prompt).toBe('hello');
    expect(body.stream).toBe(false);
  });

  it('returns text + tokensConsumed (prompt_eval_count + eval_count)', async () => {
    const fetchSpy = stubFetch({
      response: 'Upgrade lodash to 4.17.22.',
      prompt_eval_count: 7,
      eval_count: 11,
    });
    const provider = new OllamaProvider({ fetchImpl: fetchSpy });
    const out = await provider.suggest({ prompt: 'x' });
    expect(out.text).toBe('Upgrade lodash to 4.17.22.');
    expect(out.tokensConsumed).toBe(18);
    expect(out.costUsd).toBe(0);
    expect(out.provider).toBe('ollama');
  });

  it('throws a helpful error on non-2xx response', async () => {
    const fetchSpy = stubFetch(
      {},
      { ok: false, status: 503, statusText: 'Service Unavailable' },
    );
    const provider = new OllamaProvider({ fetchImpl: fetchSpy });
    await expect(provider.suggest({ prompt: 'x' })).rejects.toThrow(
      /Ollama HTTP 503/,
    );
  });

  it('passes maxTokens through as options.num_predict', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '', eval_count: 0 }),
    } as Response);
    const provider = new OllamaProvider({
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    await provider.suggest({ prompt: 'x', maxTokens: 256 });
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.options).toEqual({ num_predict: 256 });
  });

  it('cost is always 0 (Ollama is local + free)', async () => {
    const fetchSpy = stubFetch({ response: 'x', eval_count: 5 });
    const provider = new OllamaProvider({ fetchImpl: fetchSpy });
    const out = await provider.suggest({ prompt: 'x' });
    expect(out.costUsd).toBe(0);
  });
});
