/**
 * Unit tests for severity ranking + dedupe + --fail-on policy (T-20).
 *
 * Spec mapping: AC-002-1, AC-002-5, AC-002-7, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  compareSeverity,
  dedupeByAdvisoryId,
  rankBySeverity,
  SEVERITY_DESC,
  SEVERITY_RANK,
  shouldFailOn,
} from '../../../src/scanners/severity.js';
import type { Finding } from '../../../src/scanners/correlator.js';
import type { OsvSeverityLabel } from '../../../src/scanners/vuln-db.js';

function mkFinding(
  advisoryId: string,
  severity: OsvSeverityLabel,
  componentName: string = 'pkg',
): Finding {
  return {
    componentId: `id-${componentName}`,
    componentPurl: `pkg:npm/${componentName}@1.0.0`,
    componentName,
    componentVersion: '1.0.0',
    advisoryId,
    aliases: [],
    severity,
    summary: '',
    affectedRange: { introduced: '0.0.0', fixed: undefined },
    suggestedUpgrade: null,
    references: [],
  };
}

describe('SEVERITY_RANK / SEVERITY_DESC', () => {
  it('ranks CRITICAL highest and UNKNOWN lowest', () => {
    expect(SEVERITY_RANK['CRITICAL']).toBeGreaterThan(SEVERITY_RANK['HIGH']);
    expect(SEVERITY_RANK['HIGH']).toBeGreaterThan(SEVERITY_RANK['MODERATE']);
    expect(SEVERITY_RANK['MODERATE']).toBeGreaterThan(SEVERITY_RANK['LOW']);
    expect(SEVERITY_RANK['LOW']).toBeGreaterThan(SEVERITY_RANK['UNKNOWN']);
  });

  it('lists severities in descending order', () => {
    expect(SEVERITY_DESC).toEqual([
      'CRITICAL',
      'HIGH',
      'MODERATE',
      'LOW',
      'UNKNOWN',
    ]);
  });
});

describe('compareSeverity', () => {
  it('returns -1 when `a` is more severe', () => {
    expect(compareSeverity('CRITICAL', 'LOW')).toBe(-1);
    expect(compareSeverity('HIGH', 'MODERATE')).toBe(-1);
  });

  it('returns +1 when `b` is more severe', () => {
    expect(compareSeverity('LOW', 'CRITICAL')).toBe(1);
    expect(compareSeverity('UNKNOWN', 'LOW')).toBe(1);
  });

  it('returns 0 on equal rank', () => {
    expect(compareSeverity('HIGH', 'HIGH')).toBe(0);
  });

  it('plugs into Array.sort to produce most-severe-first ordering', () => {
    const labels: OsvSeverityLabel[] = ['LOW', 'CRITICAL', 'MODERATE', 'HIGH', 'UNKNOWN'];
    labels.sort(compareSeverity);
    expect(labels).toEqual(['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'UNKNOWN']);
  });
});

describe('rankBySeverity', () => {
  it('sorts findings most-severe-first', () => {
    const input: Finding[] = [
      mkFinding('G-1', 'LOW'),
      mkFinding('G-2', 'CRITICAL'),
      mkFinding('G-3', 'MODERATE'),
      mkFinding('G-4', 'HIGH'),
    ];
    const out = rankBySeverity(input);
    expect(out.map((f) => f.advisoryId)).toEqual(['G-2', 'G-4', 'G-3', 'G-1']);
  });

  it('preserves input order within the same severity tier (stable sort)', () => {
    const input: Finding[] = [
      mkFinding('G-1', 'HIGH', 'first'),
      mkFinding('G-2', 'HIGH', 'second'),
      mkFinding('G-3', 'HIGH', 'third'),
    ];
    const out = rankBySeverity(input);
    expect(out.map((f) => f.componentName)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input array', () => {
    const input: Finding[] = [
      mkFinding('G-1', 'LOW'),
      mkFinding('G-2', 'CRITICAL'),
    ];
    const before = input.map((f) => f.advisoryId);
    rankBySeverity(input);
    expect(input.map((f) => f.advisoryId)).toEqual(before);
  });
});

describe('dedupeByAdvisoryId', () => {
  it('keeps a single entry per advisory id', () => {
    const input: Finding[] = [
      mkFinding('G-1', 'LOW'),
      mkFinding('G-1', 'LOW'),
      mkFinding('G-2', 'HIGH'),
    ];
    const out = dedupeByAdvisoryId(input);
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.advisoryId)).toEqual(['G-1', 'G-2']);
  });

  it('retains the highest-severity entry on conflict', () => {
    const input: Finding[] = [
      mkFinding('G-1', 'LOW', 'low-pkg'),
      mkFinding('G-1', 'CRITICAL', 'critical-pkg'),
      mkFinding('G-1', 'MODERATE', 'moderate-pkg'),
    ];
    const out = dedupeByAdvisoryId(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('CRITICAL');
    expect(out[0]?.componentName).toBe('critical-pkg');
  });

  it('preserves first-seen order across distinct advisory ids', () => {
    const input: Finding[] = [
      mkFinding('G-3', 'LOW'),
      mkFinding('G-1', 'LOW'),
      mkFinding('G-2', 'LOW'),
    ];
    const out = dedupeByAdvisoryId(input);
    expect(out.map((f) => f.advisoryId)).toEqual(['G-3', 'G-1', 'G-2']);
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeByAdvisoryId([])).toEqual([]);
  });
});

describe('shouldFailOn', () => {
  it('returns false on an empty findings list', () => {
    expect(shouldFailOn([], ['CRITICAL'])).toBe(false);
  });

  it('returns false when no finding meets the threshold', () => {
    const findings = [mkFinding('G-1', 'MODERATE')];
    expect(shouldFailOn(findings, ['HIGH'])).toBe(false);
  });

  it('returns true when at least one finding meets the threshold', () => {
    const findings = [mkFinding('G-1', 'LOW'), mkFinding('G-2', 'CRITICAL')];
    expect(shouldFailOn(findings, ['HIGH'])).toBe(true);
  });

  it('uses the LOWEST threshold from a multi-label set', () => {
    const findings = [mkFinding('G-1', 'LOW')];
    expect(shouldFailOn(findings, ['LOW', 'CRITICAL'])).toBe(true);
    expect(shouldFailOn(findings, ['HIGH', 'CRITICAL'])).toBe(false);
  });

  it('is case-insensitive against the OSV labels', () => {
    const findings = [mkFinding('G-1', 'HIGH')];
    expect(shouldFailOn(findings, ['high'])).toBe(true);
    expect(shouldFailOn(findings, ['HiGh'])).toBe(true);
  });

  it('ignores unknown labels in the threshold list', () => {
    const findings = [mkFinding('G-1', 'CRITICAL')];
    expect(shouldFailOn(findings, ['bogus'])).toBe(false);
    expect(shouldFailOn(findings, ['bogus', 'critical'])).toBe(true);
  });
});
