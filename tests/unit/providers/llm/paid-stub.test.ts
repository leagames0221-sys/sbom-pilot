/**
 * Unit tests for the PaidStubProvider (T-27).
 *
 * Asserts the 4 defense layers fire in the expected order on
 * construction + suggest(), and that the suggest() path itself throws
 * NOT_IMPLEMENTED at Phase α even when all 4 layers admit the call.
 *
 * Spec mapping: AC-NF-1, AC-NF-2, AC-NF-3, AC-NF-4, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  PaidDefenseError,
  PaidStubProvider,
} from '../../../../src/providers/llm/paid-stub.js';
import type { PaidProviderConfig } from '../../../../src/providers/llm/paid-defense.js';

const anthropicCfg: PaidProviderConfig = {
  providerName: 'anthropic',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  tokenLimit: 1000,
  requestLimit: 5,
  costLimitUsd: 0.5,
};

const okEnv = {
  ANTHROPIC_API_KEY: 'sk-ant-test-1234567890',
  SBOM_PILOT_LLM_PROVIDER: 'anthropic',
};

describe('PaidStubProvider — construction (Layer 1)', () => {
  it('throws when env vars are not opted in', () => {
    expect(() => new PaidStubProvider({ config: anthropicCfg, env: {} })).toThrow(
      PaidDefenseError,
    );
  });

  it('constructs successfully with correct opt-in', () => {
    const provider = new PaidStubProvider({ config: anthropicCfg, env: okEnv });
    expect(provider.name).toBe('anthropic');
  });

  it('initialises the reserve to zero used / not-poisoned', () => {
    const provider = new PaidStubProvider({ config: anthropicCfg, env: okEnv });
    const snap = provider.reserveSnapshot();
    expect(snap.tokensUsed).toBe(0);
    expect(snap.requestsUsed).toBe(0);
    expect(snap.costUsedUsd).toBe(0);
    expect(snap.poisoned).toBe(false);
  });
});

describe('PaidStubProvider — suggest() defense order', () => {
  it('throws Layer 4 (CI ban) before Layer 2 in a CI environment', async () => {
    const provider = new PaidStubProvider({
      config: anthropicCfg,
      env: { ...okEnv, CI: 'true' },
    });
    try {
      await provider.suggest({ prompt: 'x' });
      throw new Error('expected PaidDefenseError');
    } catch (e) {
      expect((e as PaidDefenseError).layer).toBe('ci-ban');
    }
  });

  it('throws Layer 2 (reserve) when a call exceeds the token ceiling', async () => {
    const provider = new PaidStubProvider({ config: anthropicCfg, env: okEnv });
    try {
      await provider.suggest({ prompt: 'x', maxTokens: 99999 });
      throw new Error('expected PaidDefenseError');
    } catch (e) {
      expect((e as PaidDefenseError).layer).toBe('reserve');
    }
  });

  it('throws NOT_IMPLEMENTED (mask layer) when all 4 layers admit the call', async () => {
    const provider = new PaidStubProvider({ config: anthropicCfg, env: okEnv });
    try {
      await provider.suggest({ prompt: 'x', maxTokens: 100 });
      throw new Error('expected PaidDefenseError');
    } catch (e) {
      expect(e).toBeInstanceOf(PaidDefenseError);
      expect((e as Error).message).toMatch(/not wired/);
    }
  });

  it('reserve-layer error message contains the masked API key suffix', async () => {
    const provider = new PaidStubProvider({ config: anthropicCfg, env: okEnv });
    try {
      await provider.suggest({ prompt: 'x', maxTokens: 99999 });
      throw new Error('expected PaidDefenseError');
    } catch (e) {
      expect((e as Error).message).toContain('sk-ant');
      expect((e as Error).message).not.toContain('test-1234567890');
    }
  });
});
