/**
 * Component-to-advisory correlator.
 *
 * Walks an IR's components against a vuln-db cache and emits a
 * `Finding[]` for every (component, advisory) pair where the component
 * is in scope of the advisory's affected-package name + ecosystem AND
 * the component's version falls inside one of the advisory's
 * version-range windows.
 *
 * Per ADR-0006 §Decision: Layer 3 (Scanners). Reads only the IR
 * (Layer 2) and the vuln-db (T-18); no parser / emitter / CLI imports.
 *
 * Phase α scope: the semver comparator handles `X.Y.Z` (with optional
 * leading `v`) numerically and degrades to lexical comparison for
 * pre-release / build-metadata forms (`1.2.0-rc1`, `1.0.0+sha.abc`).
 * This is intentionally narrow — adding a full semver library is a
 * dep adoption gate (D-PRIOR-ART-SECURITY-GATE) we defer until a
 * concrete need is captured by a failing real-world fixture.
 *
 * Spec mapping: AC-002-1, AC-002-6, ADR-0005, ADR-0006.
 */
import type { Component, SbomIR } from '../ir/index.js';
import type {
  OsvAffected,
  OsvRange,
  OsvRangeEvent,
  OsvSeverityLabel,
  OsvVulnerability,
  VulnDbCache,
} from './vuln-db.js';

/**
 * One match between an IR component and a vulnerability advisory. Each
 * advisory-component pair produces a single finding even if the advisory
 * carries multiple affected ranges that all contain the component
 * version (matched once = reported once).
 */
export interface Finding {
  /** IR Component.id of the affected component (e.g. `node_modules/lodash`). */
  componentId: string;
  componentPurl: string;
  componentName: string;
  componentVersion: string;
  /** Advisory database id, e.g. `GHSA-xxxx-yyyy-zzzz`. */
  advisoryId: string;
  /** Cross-reference aliases such as the matching `CVE-...` number. */
  aliases: string[];
  /**
   * Severity label from `database_specific.severity`. Defaults to
   * `'UNKNOWN'` when the advisory omits a severity tag.
   */
  severity: OsvSeverityLabel;
  summary: string;
  /**
   * The first range that matched (the one whose `introduced..fixed`
   * window contained the component version). Useful for downstream
   * `--fail-on critical,high` reasoning and for the SARIF emitter.
   */
  affectedRange: {
    introduced: string | undefined;
    fixed: string | undefined;
  };
  /**
   * The `fixed` version of the matching range, when one exists, so the
   * CLI can surface a one-line upgrade hint. `null` when the advisory
   * has no fix version (e.g. only `last_affected` was provided).
   */
  suggestedUpgrade: string | null;
  references: Array<{ type: string; url: string }>;
}

/**
 * Numeric/lexical hybrid version comparison sufficient for the Phase α
 * vuln-correlator. Numeric on the `X.Y.Z` triple (with optional leading
 * `v`); lexical on the remainder of the string when both inputs have
 * pre-release / build-metadata suffixes; falls back to lexical on
 * non-parseable inputs.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const numericRe = /^v?(\d+)\.(\d+)\.(\d+)(.*)$/;
  const am = a.match(numericRe);
  const bm = b.match(numericRe);
  if (am === null || bm === null) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }
  for (let i = 1; i <= 3; i++) {
    const ai = Number(am[i]);
    const bi = Number(bm[i]);
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  // Same triple — compare the tail (pre-release / build-metadata).
  // Per semver §11.3, a release (empty tail) outranks any pre-release
  // (tail beginning with `-`), so `1.2.3 > 1.2.3-rc1`. Build-metadata
  // (`+`) is ignored for precedence per §10.
  const at = am[4] ?? '';
  const bt = bm[4] ?? '';
  if (at === bt) return 0;
  const aIsPre = at.startsWith('-');
  const bIsPre = bt.startsWith('-');
  if (aIsPre && !bIsPre) return -1;
  if (!aIsPre && bIsPre) return 1;
  return at < bt ? -1 : 1;
}

/**
 * Determine whether `version` falls into any affected window described
 * by `range.events`. The OSV schema lays the windows out as an ordered
 * event sequence (`introduced X`, `fixed Y`, `introduced X2`, ...);
 * the union of `[introduced_i, fixed_i)` is the affected set, with
 * `last_affected_i` interpreted as an inclusive endpoint.
 *
 * Non-SEMVER range types (`ECOSYSTEM`, `GIT`) are not honoured at
 * Phase α scope — they return false, and the caller may surface the
 * advisory via a separate "manual review" channel in the future.
 */
export function isVersionInRange(
  version: string,
  range: OsvRange,
): { affected: boolean; matchedEvent: OsvRangeEvent | null } {
  if (range.type !== 'SEMVER') return { affected: false, matchedEvent: null };

  let inWindow = false;
  let introducedAt: string | undefined;
  for (const event of range.events) {
    if (event.introduced !== undefined) {
      if (compareSemver(version, event.introduced) >= 0) {
        inWindow = true;
        introducedAt = event.introduced;
      } else {
        inWindow = false;
        introducedAt = undefined;
      }
      continue;
    }
    if (event.fixed !== undefined) {
      if (inWindow && compareSemver(version, event.fixed) < 0) {
        return {
          affected: true,
          matchedEvent: {
            introduced: introducedAt,
            fixed: event.fixed,
          },
        };
      }
      inWindow = false;
      introducedAt = undefined;
      continue;
    }
    if (event.last_affected !== undefined) {
      if (inWindow && compareSemver(version, event.last_affected) <= 0) {
        return {
          affected: true,
          matchedEvent: {
            introduced: introducedAt,
            last_affected: event.last_affected,
          },
        };
      }
      inWindow = false;
      introducedAt = undefined;
    }
  }
  if (inWindow) {
    return {
      affected: true,
      matchedEvent: { introduced: introducedAt },
    };
  }
  return { affected: false, matchedEvent: null };
}

/**
 * Map an IR Component.ecosystem to the OSV ecosystem label that
 * advisories tag affected packages with.
 *
 *   IR `npm`         → OSV `npm`
 *   IR `PyPI`        → OSV `PyPI`
 *   IR `Go`          → OSV `Go`
 *   IR `Maven`       → OSV `Maven`
 *   IR `crates.io`   → OSV `crates.io`
 *   IR `unknown`     → no match (skipped in correlation)
 */
function osvEcosystemFor(component: Component): string | null {
  if (component.ecosystem === 'unknown') return null;
  return component.ecosystem;
}

/**
 * Decide whether an OSV advisory's `affected[].package` entry refers to
 * the given component. Match is by name + ecosystem; a pURL match is
 * also accepted when both sides supply one (the OSV pURL is
 * version-less, the IR pURL embeds the version, so compare on the
 * `name + ecosystem` projection only).
 */
function packageMatches(
  component: Component,
  affected: OsvAffected,
): boolean {
  const osvEcosystem = osvEcosystemFor(component);
  if (osvEcosystem === null) return false;
  if (affected.package.ecosystem !== osvEcosystem) return false;
  return affected.package.name === component.name;
}

/**
 * Walk the IR × DB cartesian and emit one Finding per matching
 * (component, advisory) pair.
 *
 * Findings are returned in a deterministic order: outer iteration is
 * the IR's `components[]` order, inner is the DB's `advisories[]` order.
 * A single advisory matching multiple ranges on the same component
 * produces exactly one finding (first matching range wins).
 */
export function correlate(ir: SbomIR, db: VulnDbCache): Finding[] {
  const findings: Finding[] = [];
  for (const component of ir.components) {
    for (const advisory of db.advisories) {
      const finding = matchAdvisoryToComponent(component, advisory);
      if (finding !== null) findings.push(finding);
    }
  }
  return findings;
}

function matchAdvisoryToComponent(
  component: Component,
  advisory: OsvVulnerability,
): Finding | null {
  for (const affected of advisory.affected) {
    if (!packageMatches(component, affected)) continue;
    for (const range of affected.ranges ?? []) {
      const { affected: isAffected, matchedEvent } = isVersionInRange(
        component.version,
        range,
      );
      if (!isAffected) continue;

      const severity: OsvSeverityLabel = normaliseSeverity(
        advisory.database_specific?.severity,
      );
      return {
        componentId: component.id,
        componentPurl: component.purl,
        componentName: component.name,
        componentVersion: component.version,
        advisoryId: advisory.id,
        aliases: advisory.aliases ?? [],
        severity,
        summary: advisory.summary ?? '',
        affectedRange: {
          introduced: matchedEvent?.introduced,
          fixed: matchedEvent?.fixed,
        },
        suggestedUpgrade: matchedEvent?.fixed ?? null,
        references: advisory.references ?? [],
      };
    }
  }
  return null;
}

function normaliseSeverity(raw: string | undefined): OsvSeverityLabel {
  if (raw === undefined) return 'UNKNOWN';
  const upper = raw.toUpperCase();
  if (
    upper === 'CRITICAL' ||
    upper === 'HIGH' ||
    upper === 'MODERATE' ||
    upper === 'LOW' ||
    upper === 'UNKNOWN'
  ) {
    return upper;
  }
  return 'UNKNOWN';
}
