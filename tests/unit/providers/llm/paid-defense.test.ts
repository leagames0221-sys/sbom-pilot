/**
 * Unit tests for the paid-API 6-layer defense scaffolding (T-27).
 *
 * Spec mapping: AC-NF-1, AC-NF-2, AC-NF-3, AC-NF-4, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  assertNotCiAutoCall,
  constructorGate,
  maskApiKey,
  newReserveState,
  PaidDefenseError,
  preflightReserve,
  type PaidProviderConfig,
} from '../../../../src/providers/llm/paid-defense.js';

const anthropicCfg: PaidProviderConfig = {
  providerName: 'anthropic',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  tokenLimit: 1000,
  requestLimit: 5,
  costLimitUsd: 0.5,
};

describe('Layer 1 — constructor gate (AC-NF-1)', () => {
  it('throws PaidDefenseError when the API key env var is unset', () => {
    expect(() => constructorGate(anthropicCfg, {})).toThrow(PaidDefenseError);
  });

  it('throws PaidDefenseError when the API key env var is empty', () => {
    expect(() =>
      constructorGate(anthropicCfg, { ANTHROPIC_API_KEY: '' }),
    ).toThrow(PaidDefenseError);
  });

  it('throws PaidDefenseError when SBOM_PILOT_LLM_PROVIDER is missing', () => {
    expect(() =>
      constructorGate(anthropicCfg, { ANTHROPIC_API_KEY: 'sk-ant-xxxx' }),
    ).toThrow(PaidDefenseError);
  });

  it('throws PaidDefenseError when SBOM_PILOT_LLM_PROVIDER does not match providerName', () => {
    expect(() =>
      constructorGate(anthropicCfg, {
        ANTHROPIC_API_KEY: 'sk-ant-xxxx',
        SBOM_PILOT_LLM_PROVIDER: 'openai',
      }),
    ).toThrow(PaidDefenseError);
  });

  it('returns the API key when both env vars are correctly set', () => {
    const key = constructorGate(anthropicCfg, {
      ANTHROPIC_API_KEY: 'sk-ant-xxxx-yyyy',
      SBOM_PILOT_LLM_PROVIDER: 'anthropic',
    });
    expect(key).toBe('sk-ant-xxxx-yyyy');
  });

  it('error layer field is "constructor"', () => {
    try {
      constructorGate(anthropicCfg, {});
      throw new Error('expected PaidDefenseError');
    } catch (e) {
      expect(e).toBeInstanceOf(PaidDefenseError);
      expect((e as PaidDefenseError).layer).toBe('constructor');
    }
  });
});

describe('Layer 2 — pre-flight reserve (AC-NF-2)', () => {
  it('admits a charge that fits all three ceilings', () => {
    const next = preflightReserve(
      newReserveState(),
      { tokens: 100, costUsd: 0.05 },
      anthropicCfg,
    );
    expect(next.tokensUsed).toBe(100);
    expect(next.requestsUsed).toBe(1);
    expect(next.costUsedUsd).toBe(0.05);
    expect(next.poisoned).toBe(false);
  });

  it('throws when the token ceiling would be exceeded', () => {
    expect(() =>
      preflightReserve(
        newReserveState(),
        { tokens: 5000, costUsd: 0.01 },
        anthropicCfg,
      ),
    ).toThrow(/token ceiling/);
  });

  it('throws when the request-count ceiling would be exceeded', () => {
    const state = {
      tokensUsed: 10,
      requestsUsed: 5,
      costUsedUsd: 0.01,
      poisoned: false,
    };
    expect(() =>
      preflightReserve(
        state,
        { tokens: 10, costUsd: 0.01 },
        anthropicCfg,
      ),
    ).toThrow(/request-count ceiling/);
  });

  it('throws when the cost ceiling would be exceeded', () => {
    expect(() =>
      preflightReserve(
        newReserveState(),
        { tokens: 100, costUsd: 1.0 },
        anthropicCfg,
      ),
    ).toThrow(/cost ceiling/);
  });

  it('refuses further calls once poisoned (sticky)', () => {
    const poisoned = { ...newReserveState(), poisoned: true };
    expect(() =>
      preflightReserve(
        poisoned,
        { tokens: 1, costUsd: 0.001 },
        anthropicCfg,
      ),
    ).toThrow(/poisoned/);
  });

  it('error layer field is "reserve"', () => {
    try {
      preflightReserve(
        newReserveState(),
        { tokens: 5000, costUsd: 0 },
        anthropicCfg,
      );
      throw new Error('expected PaidDefenseError');
    } catch (e) {
      expect((e as PaidDefenseError).layer).toBe('reserve');
    }
  });
});

describe('Layer 3 — key non-leak (AC-NF-3)', () => {
  it('keeps the first 6 chars + replaces the rest with *', () => {
    expect(maskApiKey('sk-ant-1234567890abcdef')).toBe(
      'sk-ant' + '*'.repeat('-1234567890abcdef'.length),
    );
  });

  it('renders ≤ 6 char keys as ***', () => {
    expect(maskApiKey('short')).toBe('***');
    expect(maskApiKey('')).toBe('***');
  });

  it('preserves the rendered length for long keys', () => {
    const key = 'sk-ant-' + 'a'.repeat(40);
    expect(maskApiKey(key).length).toBe(key.length);
  });

  it('does not contain the secret suffix anywhere in the masked string', () => {
    const secret = 'sk-ant-zzzzzzzzzzzzzzzz-9999';
    const masked = maskApiKey(secret);
    expect(masked).not.toContain('zzzzzzzzzzzzzzzz');
    expect(masked).not.toContain('9999');
  });
});

describe('Layer 4 — CI auto-call ban (AC-NF-4)', () => {
  it('passes through when CI is unset', () => {
    expect(() => assertNotCiAutoCall({})).not.toThrow();
  });

  it('throws when CI=true', () => {
    expect(() => assertNotCiAutoCall({ CI: 'true' })).toThrow(/CI environment/);
  });

  it('throws when CI=1 (alternate truthy form)', () => {
    expect(() => assertNotCiAutoCall({ CI: '1' })).toThrow(/CI environment/);
  });

  it('allows through with SBOM_PILOT_TEST_ALLOW_PAID=1 (sandboxed CI step)', () => {
    expect(() =>
      assertNotCiAutoCall({ CI: 'true', SBOM_PILOT_TEST_ALLOW_PAID: '1' }),
    ).not.toThrow();
  });

  it('error layer field is "ci-ban"', () => {
    try {
      assertNotCiAutoCall({ CI: 'true' });
      throw new Error('expected PaidDefenseError');
    } catch (e) {
      expect((e as PaidDefenseError).layer).toBe('ci-ban');
    }
  });
});
