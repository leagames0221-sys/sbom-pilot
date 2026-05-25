/**
 * Severity vocabulary + ordering — Layer 2 (IR) leaf module.
 *
 * Pure data + pure comparators on the OSV severity label set. Owned by
 * the IR layer (not Scanners) so that downstream consumers — emitters,
 * compliance reporters, the CLI — can sort or partition by severity
 * without violating the ADR-0006 one-way edge that forbids Emitters →
 * Scanners imports.
 *
 * The naming inherits the `Osv` prefix because the OSV.dev advisory
 * schema is the literal source-of-truth for the label set; we do not
 * extend it with project-local levels.
 *
 * Spec mapping: AC-002-5, ADR-0005 (IR ownership of vocab), ADR-0006
 * (one-way dependency direction).
 */

export type OsvSeverityLabel =
  | 'CRITICAL'
  | 'HIGH'
  | 'MODERATE'
  | 'LOW'
  | 'UNKNOWN';

/**
 * Numeric rank for each OSV severity label. CRITICAL is the highest.
 * UNKNOWN sorts last so missing-severity findings appear at the bottom
 * of the report rather than masquerading as low-importance items.
 */
export const SEVERITY_RANK: Readonly<Record<OsvSeverityLabel, number>> = {
  CRITICAL: 4,
  HIGH: 3,
  MODERATE: 2,
  LOW: 1,
  UNKNOWN: 0,
};

/**
 * Severity labels listed from most severe to least severe — useful for
 * iteration order in reports and for sanity checks against SEVERITY_RANK.
 */
export const SEVERITY_DESC: ReadonlyArray<OsvSeverityLabel> = [
  'CRITICAL',
  'HIGH',
  'MODERATE',
  'LOW',
  'UNKNOWN',
];

/**
 * Compare two severity labels for sort ordering.
 *
 * - Negative when `a` is MORE severe than `b` (so it sorts first under
 *   a default ascending sort)
 * - Positive when `b` is more severe
 * - Zero on equal rank
 *
 * Matches the `Array.prototype.sort` comparator contract so callers can
 * use it directly: `findings.sort((x, y) => compareSeverity(x.severity, y.severity))`.
 */
export function compareSeverity(
  a: OsvSeverityLabel,
  b: OsvSeverityLabel,
): -1 | 0 | 1 {
  const ra = SEVERITY_RANK[a];
  const rb = SEVERITY_RANK[b];
  if (ra > rb) return -1;
  if (ra < rb) return 1;
  return 0;
}
