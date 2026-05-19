/**
 * End-to-end tests for `sbom-pilot suggest` (T-31).
 *
 * Spec mapping: AC-NF-5, AC-005-1, ADR-0005, ADR-0006.
 */
import { describe, expect, it, vi } from 'vitest';
import { runCli, type CliRunOptions } from '../../src/cli/index.js';
import { EX_OK, EX_TEMPFAIL } from '../../src/exit-codes.js';

interface CapturedRun {
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}

async function runCaptured(argv: ReadonlyArray<string>): Promise<CapturedRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;
  const opts: CliRunOptions = {
    argv,
    stdout: (s: string) => stdout.push(s),
    stderr: (s: string) => stderr.push(s),
    exit: (c: number) => {
      exitCode = c;
    },
  };
  await runCli(opts);
  return { stdout, stderr, exitCode };
}

describe('sbom-pilot suggest — explicit --provider', () => {
  it('--provider mock returns mock text and exits EX_OK', async () => {
    const out = await runCaptured(['suggest', 'GHSA-test-x', '--provider', 'mock']);
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stdout.join('\n')).toContain('mock provider');
  });

  it('--provider anthropic throws PaidDefenseError when env opt-in is missing', async () => {
    const out = await runCaptured(['suggest', 'GHSA-test-x', '--provider', 'anthropic']);
    expect(out.exitCode).toBe(EX_TEMPFAIL);
    expect(out.stderr.join('\n')).toMatch(/blocked/);
  });

  it('--provider with typo falls through to mock (createProvider safety net)', async () => {
    const out = await runCaptured(['suggest', 'GHSA-test-x', '--provider', 'mocky']);
    // createProvider falls back to mock on unrecognised names.
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stdout.join('\n')).toContain('mock provider');
  });
});

// Note: the default (no --provider) e2e path would attempt to fetch
// Ollama at localhost:11434 which is unreliable in CI; the
// suggestAction unit test below uses injected fetchImpl to exercise
// the Ollama-OK branch deterministically. A mock-fallback unit test
// could be added by injecting a rejecting fetchImpl, but the explicit
// --provider mock path already covers the mock-emit logic.

describe('suggestAction unit — default Ollama branch with injected fetch', () => {
  it('uses injected ollamaFetch when present and emits its response', async () => {
    const { suggestAction } = await import('../../src/cli/subcommands/suggest.js');
    const stdout: string[] = [];
    const stderr: string[] = [];
    let exitCode: number | null = null;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'Pin to >=1.2.3.', eval_count: 5 }),
    } as Response);
    await suggestAction(
      'GHSA-x',
      { ollamaFetch: fetchImpl as unknown as typeof fetch },
      {
        stdout: (s) => stdout.push(s),
        stderr: (s) => stderr.push(s),
        exit: (c) => {
          exitCode = c;
        },
      },
      {},
    );
    expect(exitCode).toBe(EX_OK);
    expect(stdout.join('\n')).toContain('Pin to >=1.2.3.');
  });
});
