/**
 * cosign verification gate for the opt-in Anchore subprocess path
 * (T-39, AC-NF-cosign-gate, ADR-0001 §"Adoption shape").
 *
 * The Anchore binaries (syft / grype) are published with cosign keyless
 * signatures (per ADR-0001 Gate 3 evidence). When a user opts into the
 * subprocess path via `--use-syft` / `--use-grype`, sbom-pilot MUST
 * verify the local binary's cosign signature BEFORE spawning the
 * subprocess. Failure → refuse with `EX_NOPERM`, never spawn.
 *
 * Phase α scope:
 *   - This module implements the GATE only. The downstream subprocess
 *     spawn (parsing syft's `spdx-json` or grype's `--output json`
 *     stdout into the IR) is intentionally deferred; the gate refusal
 *     path is what AC-NF-cosign-gate literally requires.
 *   - The cosign binary itself is treated as an external tool: when it
 *     is not on PATH (or invocation fails), the gate refuses by default
 *     (closed-fails). The path "user has cosign + valid signature"
 *     returns `{ ok: true, ... }` and is the only success surface.
 *
 * Layer placement:
 *   src/subprocess/ is a side leaf module owned by the CLI (Layer 5).
 *   Nothing in Layers 1–4 imports from here.
 *
 * Spec mapping: AC-NF-cosign-gate, ADR-0001 §"Adoption shape", §3
 * Gate 3 (signed releases).
 */

import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

/**
 * The supported tool identifiers. Each maps to:
 *   - The Anchore project name used in error messages
 *   - The cosign certificate identity expected for that project
 *     (keyless signing pattern; identity is the GitHub Actions
 *     workflow URL pattern Anchore uses for their releases).
 */
export type CosignTarget = 'syft' | 'grype';

export interface CosignVerifyOptions {
  /** Absolute path to the local Anchore binary being verified. */
  binaryPath: string;
  /** Path to the cosign signature (`.sig`) — typically published alongside the binary. */
  signaturePath: string;
  /** Path to the cosign certificate (`.pem`) — keyless signing artefact. */
  certificatePath: string;
  /**
   * Optional override for the cosign CLI invoker. The default uses
   * `child_process.spawnSync` against the `cosign` command on PATH; tests
   * inject a stub to deterministically simulate verify success / failure
   * without needing cosign installed on the test machine.
   */
  spawn?: (
    cmd: string,
    args: ReadonlyArray<string>,
    opts: SpawnSyncOptions,
  ) => { status: number | null; stdout: string; stderr: string };
}

export interface CosignVerifyResult {
  ok: boolean;
  /** Short, user-facing message suitable for stderr emission. */
  message: string;
  /**
   * Internal failure class for callers that need to differentiate
   * between "cosign not installed" and "signature did not verify".
   * `'verified'` is the only success class.
   */
  reason:
    | 'verified'
    | 'cosign-missing'
    | 'signature-mismatch'
    | 'invocation-failure';
}

const COSIGN_CERT_IDENTITY: Readonly<Record<CosignTarget, string>> = {
  syft:
    'https://github.com/anchore/syft/.github/workflows/release.yaml@refs/tags/',
  grype:
    'https://github.com/anchore/grype/.github/workflows/release.yaml@refs/tags/',
};

const COSIGN_CERT_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

/**
 * Default cosign invoker — spawns `cosign verify-blob` synchronously.
 * Exposed (rather than inlined) so the test harness can swap in a stub
 * without monkey-patching child_process at the module level.
 *
 * spawnSync does NOT throw on spawn failure (e.g. cosign not on PATH).
 * Instead it returns an object whose `.error` is set to an Error with
 * `.code === 'ENOENT'`. The verifyAnchoreBinary outer try/catch expects
 * a throw to route the ENOENT branch — so this wrapper RE-THROWS
 * spawnSync's `.error` to preserve that contract. Without the re-throw,
 * a missing cosign falls into the "exit code !== 0" path and is
 * mis-classified as a signature-mismatch (review finding 2026-05-20).
 */
function defaultCosignSpawn(
  cmd: string,
  args: ReadonlyArray<string>,
  opts: SpawnSyncOptions,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(cmd, [...args], { ...opts, encoding: 'utf8' });
  if (result.error !== undefined && result.error !== null) {
    throw result.error;
  }
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

/**
 * Exposed for integration testing: invokes `defaultCosignSpawn` against
 * an intentionally-non-existent binary so the real `child_process.spawnSync`
 * path is exercised, not just the test-injected stub. Used by the cosign
 * integration test to assert ENOENT bubbles up correctly (and thus the
 * cosign-missing branch in verifyAnchoreBinary fires in production).
 */
export const __defaultCosignSpawnForTests = defaultCosignSpawn;

/**
 * Verify an Anchore binary's cosign signature against the published
 * certificate identity for the given target tool.
 *
 * Return shape is exhaustive (never throws on the happy path). Callers
 * branch on `ok` for the gate decision; `reason` is for diagnostic
 * stderr messages and tests.
 */
export function verifyAnchoreBinary(
  target: CosignTarget,
  options: CosignVerifyOptions,
): CosignVerifyResult {
  const spawn = options.spawn ?? defaultCosignSpawn;
  const certIdentityPrefix = COSIGN_CERT_IDENTITY[target];

  let result;
  try {
    result = spawn(
      'cosign',
      [
        'verify-blob',
        '--certificate',
        options.certificatePath,
        '--signature',
        options.signaturePath,
        '--certificate-identity-regexp',
        // Pin to the Anchore release workflow path; allow any tag
        // suffix so a fresh release does not require code changes.
        `^${escapeRegex(certIdentityPrefix)}.+`,
        '--certificate-oidc-issuer',
        COSIGN_CERT_OIDC_ISSUER,
        options.binaryPath,
      ],
      {},
    );
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'ENOENT') {
      return {
        ok: false,
        reason: 'cosign-missing',
        message:
          'cosign binary not found on PATH. Install cosign from https://docs.sigstore.dev/cosign/installation/ and re-try.',
      };
    }
    return {
      ok: false,
      reason: 'invocation-failure',
      message: `cosign invocation failed: ${err.message ?? 'unknown error'}`,
    };
  }

  if (result.status === 0) {
    return {
      ok: true,
      reason: 'verified',
      message: `cosign verified ${target} binary at ${options.binaryPath}.`,
    };
  }

  // cosign returns exit 1 on signature mismatch and other failures.
  // We surface the stderr tail to the caller so a user can triage
  // "wrong cert" vs "tampered binary".
  const tail = result.stderr.trim().split('\n').slice(-3).join('\n');
  return {
    ok: false,
    reason: 'signature-mismatch',
    message: `cosign verify-blob refused the ${target} binary at ${options.binaryPath} (exit ${result.status}). Last cosign output:\n${tail}`,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
