/**
 * sysexits-aligned process exit codes.
 *
 * Values mirror BSD `sysexits.h` (FreeBSD `/usr/include/sysexits.h`,
 * canonical reference). Using these values keeps `sbom-pilot` interoperable
 * with shell pipelines, CI gate scripts, and the wider Unix CLI ecosystem.
 *
 * Reference:
 *   https://man.freebsd.org/cgi/man.cgi?query=sysexits&sektion=3
 *
 * Spec mapping:
 *   - AC-005-2 → EX_USAGE on unrecognised subcommand
 *   - AC-005-3 → EX_CONFIG on Node version below 20 LTS
 *   - AC-001-4 → EX_DATAERR on missing manifest
 *   - AC-002-5 → EX_SOFTWARE on --fail-on severity threshold trip
 *   - AC-003-4 → EX_USAGE on SPDX-only input to EU CRA reporter
 *   - AC-003-6 → EX_USAGE on `report` without --standard
 *   - AC-NF-cosign-gate → EX_NOPERM on cosign verification failure
 */

/** Successful termination. */
export const EX_OK = 0;

/** Command was used incorrectly (bad args, missing flag, unrecognised subcommand). */
export const EX_USAGE = 64;

/** Input data was incorrect in some way (malformed manifest, invalid SBOM, etc.). */
export const EX_DATAERR = 65;

/** Required input file (or stdin) could not be opened. */
export const EX_NOINPUT = 66;

/** A service or external dependency is not available (network down, OSV API unreachable in --refresh mode). */
export const EX_UNAVAILABLE = 69;

/** Internal software error has been detected — should not happen if the user's input is well-formed. */
export const EX_SOFTWARE = 70;

/** A critical system / install file is missing or corrupt (vendored JSON schema absent). */
export const EX_OSFILE = 72;

/** Input or output error on a file the tool tried to read or write. */
export const EX_IOERR = 74;

/** Temporary failure — the user is invited to retry (transient network glitch on --refresh). */
export const EX_TEMPFAIL = 75;

/** Permission denied (cosign verification failed for opt-in subprocess binaries). */
export const EX_NOPERM = 77;

/** Configuration error in the host environment (Node version below required minimum). */
export const EX_CONFIG = 78;

/** Strongly-typed enum view for ergonomic imports. */
export const ExitCodes = {
  EX_OK,
  EX_USAGE,
  EX_DATAERR,
  EX_NOINPUT,
  EX_UNAVAILABLE,
  EX_SOFTWARE,
  EX_OSFILE,
  EX_IOERR,
  EX_TEMPFAIL,
  EX_NOPERM,
  EX_CONFIG,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];
