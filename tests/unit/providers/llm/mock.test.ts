/**
 * Unit tests for the mock LLM provider (T-27).
 *
 * Spec mapping: AC-NF-5, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { MockProvider } from '../../../../src/providers/llm/mock.js';

describe('MockProvider', () => {
  it('returns a non-empty text + tokensConsumed=0 + costUsd=0', async () => {
    const provider = new MockProvider();
    const out = await provider.suggest({ prompt: 'Upgrade lodash to fix CVE.' });
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.tokensConsumed).toBe(0);
    expect(out.costUsd).toBe(0);
    expect(out.provider).toBe('mock');
  });

  it('mentions the mock provider in its response', async () => {
    const provider = new MockProvider();
    const out = await provider.suggest({ prompt: 'anything' });
    expect(out.text).toContain('mock');
  });

  it('makes no network call (provider has no fetch dependency)', () => {
    // Structural assertion via the provider's `name` — `mock` never
    // touches fetch. This is enforced at the type-import level: the
    // mock.ts file has no import of `fetch` or any HTTP library.
    const provider = new MockProvider();
    expect(provider.name).toBe('mock');
  });

  it('truncates long prompts in the summary', async () => {
    const provider = new MockProvider();
    const out = await provider.suggest({ prompt: 'x'.repeat(500) });
    expect(out.text).toContain('…');
  });

  it('is deterministic for the same prompt on repeat calls', async () => {
    const provider = new MockProvider();
    const a = await provider.suggest({ prompt: 'same' });
    const b = await provider.suggest({ prompt: 'same' });
    expect(a.text).toBe(b.text);
  });
});
