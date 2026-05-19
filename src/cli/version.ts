/**
 * CLI version + Node-engine gate.
 *
 * Two responsibilities:
 *   - Read the running tool's version from package.json so `--version`
 *     prints a real value rather than a hard-coded string that would
 *     drift from the published package.
 *   - Enforce the Node ≥ 20 engine requirement at startup; older
 *     runtimes exit with EX_CONFIG before any other code path runs
 *     (AC-005-3 / AC-NF-engine-strict).
 *
 * Per ADR-0006 §Decision: src/cli/ is Layer 5. It depends on
 * src/exit-codes.ts (a leaf utility, allowed) and the providers /
 * emitters layers below it.
 *
 * Spec mapping: AC-005-3, AC-005-5, AC-NF-engine-strict, ADR-0006.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EX_CONFIG } from '../exit-codes.js';

export interface VersionInfo {
  version: string;
  /**
   * Short git SHA, or null when the binary is run from an installed
   * (non-git) tree or when the git child process is unavailable.
   * Computed lazily — `--version` is the only consumer.
   */
  gitHash: string | null;
}

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from the compiled file's directory until we find a
 * package.json. Works both for source (src/cli/) and dist
 * (dist/cli/) layouts because the parent package root is always two
 * `..` segments up.
 */
function findPackageJson(): string {
  // src/cli/version.ts → ../../package.json
  // dist/cli/version.js → ../../package.json
  return join(here, '..', '..', 'package.json');
}

let cachedVersion: string | null = null;

export function readPackageVersion(): string {
  if (cachedVersion !== null) return cachedVersion;
  const path = findPackageJson();
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as { version?: string };
  cachedVersion = parsed.version ?? '0.0.0-unknown';
  return cachedVersion;
}

/**
 * Compose the `--version` output line. Future enhancement (T-38
 * benchmark) may wire the git short SHA via child_process; at T-29
 * scope the gitHash is exposed as a hook but populated null.
 */
export function formatVersionLine(info: VersionInfo): string {
  if (info.gitHash === null || info.gitHash.length === 0) {
    return `sbom-pilot ${info.version}`;
  }
  return `sbom-pilot ${info.version} (${info.gitHash})`;
}

/**
 * Parse a Node version string ("v22.5.1" or "22.5.1") into its major
 * integer. Returns NaN on unparseable input.
 */
export function parseNodeMajor(version: string): number {
  const stripped = version.startsWith('v') ? version.slice(1) : version;
  const major = stripped.split('.')[0] ?? '';
  return parseInt(major, 10);
}

export interface NodeEngineCheck {
  ok: boolean;
  /** The running runtime's major version (NaN when unparseable). */
  running: number;
  /** The minimum supported major version. */
  required: number;
  /** Error message suitable for stderr when `ok` is false. */
  message: string | null;
}

export const MINIMUM_NODE_MAJOR = 20;

/**
 * Inspect a Node version string against the project's minimum
 * supported runtime. The CLI bootstrap (src/cli/index.ts) calls this
 * with `process.versions.node` at the top of `main()` and exits with
 * `EX_CONFIG` when ok=false.
 *
 * `nodeVersion` is injectable so tests can drive both the pass and
 * fail paths without touching the real interpreter.
 */
export function checkNodeEngine(
  nodeVersion: string,
  minimumMajor: number = MINIMUM_NODE_MAJOR,
): NodeEngineCheck {
  const running = parseNodeMajor(nodeVersion);
  if (Number.isNaN(running)) {
    return {
      ok: false,
      running,
      required: minimumMajor,
      message: `sbom-pilot: cannot parse Node version "${nodeVersion}". Minimum required: v${minimumMajor}.`,
    };
  }
  if (running < minimumMajor) {
    return {
      ok: false,
      running,
      required: minimumMajor,
      message: `sbom-pilot: Node v${running} is below the minimum required v${minimumMajor}. Upgrade Node and re-run.`,
    };
  }
  return { ok: true, running, required: minimumMajor, message: null };
}

export { EX_CONFIG };
