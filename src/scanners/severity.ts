/**
 * Severity ranking, dedupe, and `--fail-on` policy for Finding[].
 *
 * Three concerns:
 *
 *   1. Ranking — produce a stable ordering with the most severe findings
 *      first. CRITICAL > HIGH > MODERATE > LOW > UNKNOWN per the OSV
 *      severity label convention. Within a single severity tier, the
 *      input order is preserved (a stable sort) so the SARIF emitter
 *      (T-21) and the CLI summary (T-30) lay findings out predictably.
 *
 *   2. Dedupe — when multiple components in the same project match the
 *      same advisory id (rare but possible — monorepo workspaces with
 *      duplicate package nesting), collapse to a single finding per
 *      `advisoryId`. The collapsed entry keeps the highest-severity
 *      label encountered for that id (defensive — if the OSV record
 *      changes severity between calls, the worst label wins).
 *
 *   3. --fail-on policy — given a threshold set of severities, return
 *      true when at least one finding's severity is at or above the
 *      lowest threshold in the set. CLI exit-code wiring at T-30 maps
 *      this to `EX_SOFTWARE` per AC-002-5.
 *
 * Per ADR-0006 §Decision: Layer 3 (Scanners). Reads only the correlator
 * (T-19) output via the Finding type re-export. No imports from
 * emitters, parsers, or CLI.
 *
 * Spec mapping: AC-002-1, AC-002-5, AC-002-7, ADR-0005, ADR-0006.
 */
import type { OsvSeverityLabel } from '../ir/severity.js';
import type { Finding } from './correlator.js';
// Severity vocabulary + ordering primitives live on the IR layer
// (src/ir/severity.ts) so Emitters can sort by severity without
// violating ADR-0006 edge 4 (Emitters → Scanners forbidden).
// Re-export here to preserve the current public surface for callers
// already importing from src/scanners/severity.js.
export {
  SEVERITY_RANK,
  SEVERITY_DESC,
  compareSeverity,
} from '../ir/severity.js';
import { compareSeverity, SEVERITY_RANK } from '../ir/severity.js';

/**
 * Return a new array with findings sorted by severity (most severe
 * first). Stable: findings of equal severity preserve input order.
 *
 * The input array is not mutated.
 */
export function rankBySeverity(findings: ReadonlyArray<Finding>): Finding[] {
  // Array.prototype.sort is stable on V8 ≥ 7.0 (Node 12+); we target
  // Node 20+ so we can rely on stability without an index-prepend dance.
  return [...findings].sort((a, b) => compareSeverity(a.severity, b.severity));
}

/**
 * Collapse multiple findings sharing the same `advisoryId` into a
 * single entry. The retained entry is the highest-severity occurrence;
 * on tie, the first-encountered entry wins. Input order is preserved
 * for the deduplicated results (one finding per advisory id, in the
 * order each advisory was first seen).
 *
 * Inputs are never mutated.
 */
export function dedupeByAdvisoryId(
  findings: ReadonlyArray<Finding>,
): Finding[] {
  const bestById = new Map<string, Finding>();
  const order: string[] = [];
  for (const f of findings) {
    const current = bestById.get(f.advisoryId);
    if (current === undefined) {
      bestById.set(f.advisoryId, f);
      order.push(f.advisoryId);
      continue;
    }
    if (compareSeverity(f.severity, current.severity) < 0) {
      // The new finding is MORE severe (compareSeverity returns -1 when
      // `a` is more severe), so replace.
      bestById.set(f.advisoryId, f);
    }
  }
  return order.map((id) => bestById.get(id)!);
}

/**
 * Decide whether the `--fail-on` policy is triggered by the given
 * findings. Returns true when at least one finding has severity at or
 * above the **lowest** label in `thresholds`.
 *
 * Examples:
 *   shouldFailOn([critical-fnd, low-fnd], ['HIGH'])           → true
 *   shouldFailOn([moderate-fnd],         ['HIGH'])            → false
 *   shouldFailOn([],                     ['CRITICAL'])        → false
 *   shouldFailOn([low-fnd],              ['LOW', 'CRITICAL']) → true (LOW is in set)
 *
 * Thresholds are case-insensitive against the OSV labels; unknown labels
 * are ignored (a malformed `--fail-on critical,bogus` is equivalent to
 * `--fail-on critical`).
 */
export function shouldFailOn(
  findings: ReadonlyArray<Finding>,
  thresholds: ReadonlyArray<string>,
): boolean {
  const normalised = thresholds
    .map((t) => t.toUpperCase())
    .filter((t): t is OsvSeverityLabel =>
      Object.prototype.hasOwnProperty.call(SEVERITY_RANK, t),
    );
  if (normalised.length === 0) return false;
  const lowestRequiredRank = Math.min(
    ...normalised.map((t) => SEVERITY_RANK[t]),
  );
  return findings.some((f) => SEVERITY_RANK[f.severity] >= lowestRequiredRank);
}
