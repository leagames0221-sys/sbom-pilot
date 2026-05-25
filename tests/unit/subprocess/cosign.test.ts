/**
 * Unit tests for the cosign verification gate (T-39, AC-NF-cosign-gate).
 *
 * The tests inject a stub `spawn` shim so the cosign binary does not
 * need to be installed on the test machine. Each case asserts:
 *
 *   - happy path: spawn exit 0 → ok=true, reason='verified'
 *   - signature mismatch: spawn exit 1 → ok=false, reason='signature-mismatch',
 *     stderr tail surfaced in the message
 *   - cosign missing: spawn throws ENOENT → ok=false, reason='cosign-missing'
 *   - other invocation failure: spawn throws non-ENOENT → ok=false,
 *     reason='invocation-failure'
 *
 * Additionally: the sbom-action wiring is exercised end-to-end so the
 * literal AC ("verify fails → EX_NOPERM, no spawn") is asserted: the
 * sbomAction is invoked with a stub spawn that simulates verify failure
 * and the test asserts the exit code is EX_NOPERM and the project-
 * parser was never reached.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  verifyAnchoreBinary,
  __defaultCosignSpawnForTests,
} from '../../../src/subprocess/cosign.js';
import { sbomAction } from '../../../src/cli/subcommands/sbom.js';
import { EX_NOPERM } from '../../../src/exit-codes.js';

describe('verifyAnchoreBinary — gate cases', () => {
  const baseOpts = {
    binaryPath: '/tmp/fake/syft',
    signaturePath: '/tmp/fake/syft.sig',
    certificatePath: '/tmp/fake/syft.pem',
  } as const;

  it('returns ok=true with reason "verified" when cosign exits 0', () => {
    const spawn = vi.fn().mockReturnValue({
      status: 0,
      stdout: 'Verified OK\n',
      stderr: '',
    });
    const res = verifyAnchoreBinary('syft', { ...baseOpts, spawn });
    expect(res.ok).toBe(true);
    expect(res.reason).toBe('verified');
    expect(res.message).toContain('cosign verified syft');
    expect(spawn).toHaveBeenCalledOnce();
    // verify-blob arg list shape (no exhaustive match, just key flags)
    const [, args] = spawn.mock.calls[0] ?? [];
    expect(args).toContain('verify-blob');
    expect(args).toContain('--certificate-identity-regexp');
  });

  it('returns ok=false reason "signature-mismatch" when cosign exits 1', () => {
    const spawn = vi.fn().mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'error: signature verification failed\nbad cert chain\n',
    });
    const res = verifyAnchoreBinary('grype', { ...baseOpts, spawn });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('signature-mismatch');
    expect(res.message).toContain('refused the grype binary');
    expect(res.message).toContain('signature verification failed');
  });

  it('returns ok=false reason "cosign-missing" on ENOENT', () => {
    const spawn = vi.fn().mockImplementation(() => {
      const err = new Error('spawn cosign ENOENT') as Error & { code?: string };
      err.code = 'ENOENT';
      throw err;
    });
    const res = verifyAnchoreBinary('syft', { ...baseOpts, spawn });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('cosign-missing');
    expect(res.message).toContain('cosign binary not found');
  });

  it('returns ok=false reason "invocation-failure" on other throw', () => {
    const spawn = vi.fn().mockImplementation(() => {
      throw new Error('EPERM: operation not permitted');
    });
    const res = verifyAnchoreBinary('syft', { ...baseOpts, spawn });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('invocation-failure');
    expect(res.message).toContain('cosign invocation failed');
  });
});

describe('defaultCosignSpawn — production spawn path integration', () => {
  // Integration test for the real `child_process.spawnSync` wrapper
  // (review finding 2026-05-20: the wrapper was dropping spawnSync's
  // `.error` field, so a missing cosign binary in production would be
  // mis-classified as a signature-mismatch instead of the cosign-
  // missing branch). This test exercises the wrapper directly with a
  // command that is guaranteed not to exist on PATH, asserting that
  // it re-throws the ENOENT-class error so verifyAnchoreBinary's
  // outer try/catch can route it correctly.
  it('re-throws spawnSync\'s ENOENT when the cosign binary is not on PATH', () => {
    // The wrapper is internal but exported as a test escape hatch.
    expect(() => {
      __defaultCosignSpawnForTests(
        'sbom-pilot-definitely-not-a-real-binary-xyz-23042',
        ['--help'],
        {},
      );
    }).toThrowError(/ENOENT|spawn .* ENOENT|not.*recognized/i);
  });
});

describe('sbomAction — --use-syft cosign gate (AC-NF-cosign-gate)', () => {
  function makeCtx() {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const probe = { exitCode: null as number | null };
    const ctx = {
      stdout: (l: string) => stdoutLines.push(l),
      stderr: (l: string) => stderrLines.push(l),
      exit: (c: number) => {
        probe.exitCode = c;
      },
    };
    return { ctx, stdoutLines, stderrLines, probe };
  }

  it('refuses with EX_NOPERM when cosign verify fails — no parser invocation', async () => {
    const { ctx, stderrLines, probe } = makeCtx();
    const cosignSpawn = vi.fn().mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'signature verification failed (tampered binary)\n',
    });

    await sbomAction(
      // The project-dir is intentionally a path that DOES NOT exist —
      // if the cosign gate refusal does not short-circuit, dispatchParser
      // would throw ENOENT and the test would see a non-NOPERM exit
      // code, failing the assertion.
      '/no/such/project',
      {
        format: 'spdx',
        useSyft: true,
        syftBinary: '/tmp/syft',
        syftSignature: '/tmp/syft.sig',
        syftCertificate: '/tmp/syft.pem',
        cosignSpawn,
      },
      ctx,
    );

    expect(probe.exitCode).toBe(EX_NOPERM);
    expect(stderrLines.some((l) => l.includes('refused the syft binary'))).toBe(true);
    expect(cosignSpawn).toHaveBeenCalledOnce();
  });

  it('requires the binary / signature / certificate triple under --use-grype', async () => {
    const { ctx, stderrLines, probe } = makeCtx();
    const cosignSpawn = vi.fn();

    await sbomAction(
      '/no/such/project',
      {
        format: 'spdx',
        useGrype: true,
        // Intentionally omit grypeBinary / grypeSignature / grypeCertificate
        cosignSpawn,
      },
      ctx,
    );

    // EX_USAGE (64), not EX_NOPERM — the missing-triple case is a usage
    // error, not a cosign-verify failure.
    expect(probe.exitCode).toBe(64);
    expect(
      stderrLines.some((l) =>
        l.includes('--use-grype requires --grype-binary'),
      ),
    ).toBe(true);
    expect(cosignSpawn).not.toHaveBeenCalled();
  });
});
