/**
 * Unit tests for createProvider() default-and-fallback semantics (T-27).
 *
 * Spec mapping: AC-NF-5, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  createProvider,
  PAID_DEFAULT_CONFIGS,
  PaidDefenseError,
} from '../../../../src/providers/llm/index.js';

describe('createProvider — default-and-fallback (AC-NF-5)', () => {
  it('returns MockProvider when name is undefined', () => {
    const p = createProvider(undefined, { env: {} });
    expect(p.name).toBe('mock');
  });

  it('returns MockProvider when name is "mock"', () => {
    const p = createProvider('mock', { env: {} });
    expect(p.name).toBe('mock');
  });

  it('returns OllamaProvider when name is "ollama"', () => {
    const p = createProvider('ollama', { env: {} });
    expect(p.name).toBe('ollama');
  });

  it('reads SBOM_PILOT_LLM_PROVIDER when name is undefined', () => {
    const p = createProvider(undefined, {
      env: { SBOM_PILOT_LLM_PROVIDER: 'ollama' },
    });
    expect(p.name).toBe('ollama');
  });

  it('falls back to MockProvider on an unrecognised provider name (typo defense)', () => {
    const p = createProvider('anthopic', { env: {} }); // typo
    expect(p.name).toBe('mock');
  });

  it('throws PaidDefenseError on anthropic when opt-in env vars are missing', () => {
    expect(() => createProvider('anthropic', { env: {} })).toThrow(
      PaidDefenseError,
    );
  });

  it('throws PaidDefenseError on openai when opt-in env vars are missing', () => {
    expect(() => createProvider('openai', { env: {} })).toThrow(
      PaidDefenseError,
    );
  });

  it('handles case-insensitive names', () => {
    expect(createProvider('MOCK', { env: {} }).name).toBe('mock');
    expect(createProvider('Ollama', { env: {} }).name).toBe('ollama');
  });
});

describe('PAID_DEFAULT_CONFIGS — conservative ceilings', () => {
  it('caps anthropic at USD 1.0 / 100k tokens / 50 requests', () => {
    expect(PAID_DEFAULT_CONFIGS.anthropic.costLimitUsd).toBe(1.0);
    expect(PAID_DEFAULT_CONFIGS.anthropic.tokenLimit).toBe(100_000);
    expect(PAID_DEFAULT_CONFIGS.anthropic.requestLimit).toBe(50);
  });

  it('caps openai at the same defaults', () => {
    expect(PAID_DEFAULT_CONFIGS.openai.costLimitUsd).toBe(1.0);
    expect(PAID_DEFAULT_CONFIGS.openai.tokenLimit).toBe(100_000);
    expect(PAID_DEFAULT_CONFIGS.openai.requestLimit).toBe(50);
  });

  it('reads the correct env var names per provider', () => {
    expect(PAID_DEFAULT_CONFIGS.anthropic.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
    expect(PAID_DEFAULT_CONFIGS.openai.apiKeyEnvVar).toBe('OPENAI_API_KEY');
  });
});
