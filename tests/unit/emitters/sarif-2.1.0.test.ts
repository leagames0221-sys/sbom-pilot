/**
 * Unit tests for the SARIF 2.1.0 emitter (T-21).
 *
 * Spec mapping: AC-002-1, AC-002-4, AC-002-7, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  emitSarif,
  severityToSarifLevel,
} from '../../../src/emitters/sarif-2.1.0.js';
import { serializeDocument } from '../../../src/emitters/_shared.js';
import { validate } from '../../../src/schemas/validate.js';
import type { Finding } from '../../../src/scanners/correlator.js';
import type { OsvSeverityLabel } from '../../../src/scanners/vuln-db.js';

function mkFinding(
  advisoryId: string,
  severity: OsvSeverityLabel,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    componentId: 'node_modules/pkg',
    componentPurl: 'pkg:npm/pkg@1.0.0',
    componentName: 'pkg',
    componentVersion: '1.0.0',
    advisoryId,
    aliases: ['CVE-2026-99000'],
    severity,
    summary: `Synthetic vulnerability in ${advisoryId}`,
    affectedRange: { introduced: '0.0.0', fixed: '1.1.0' },
    suggestedUpgrade: '1.1.0',
    references: [
      { type: 'ADVISORY', url: `https://example.com/${advisoryId}` },
    ],
    ...overrides,
  };
}

describe('severityToSarifLevel', () => {
  it('maps CRITICAL → error', () => {
    expect(severityToSarifLevel('CRITICAL')).toBe('error');
  });
  it('maps HIGH → error', () => {
    expect(severityToSarifLevel('HIGH')).toBe('error');
  });
  it('maps MODERATE → warning', () => {
    expect(severityToSarifLevel('MODERATE')).toBe('warning');
  });
  it('maps LOW → note', () => {
    expect(severityToSarifLevel('LOW')).toBe('note');
  });
  it('maps UNKNOWN → none', () => {
    expect(severityToSarifLevel('UNKNOWN')).toBe('none');
  });
});

describe('emitSarif — schema conformance (AC-002-4)', () => {
  it('produces a schema-valid document for empty findings', () => {
    const doc = emitSarif([]);
    const result = validate('sarif-2.1.0', doc);
    expect.soft(result.errors, 'unexpected schema errors').toBeNull();
    expect(result.ok).toBe(true);
  });

  it('produces a schema-valid document for a single finding', () => {
    const doc = emitSarif([mkFinding('GHSA-x', 'HIGH')]);
    const result = validate('sarif-2.1.0', doc);
    expect.soft(result.errors, 'unexpected schema errors').toBeNull();
    expect(result.ok).toBe(true);
  });

  it('produces a schema-valid document for multiple findings + all severities', () => {
    const doc = emitSarif([
      mkFinding('G-1', 'CRITICAL'),
      mkFinding('G-2', 'HIGH'),
      mkFinding('G-3', 'MODERATE'),
      mkFinding('G-4', 'LOW'),
      mkFinding('G-5', 'UNKNOWN'),
    ]);
    const result = validate('sarif-2.1.0', doc);
    expect.soft(result.errors, 'unexpected schema errors').toBeNull();
    expect(result.ok).toBe(true);
  });
});

describe('emitSarif — document structure', () => {
  it('sets the SARIF version + schema $schema URI', () => {
    const doc = emitSarif([]);
    expect(doc['version']).toBe('2.1.0');
    expect(typeof doc['$schema']).toBe('string');
    expect(doc['$schema']).toMatch(/sarif-schema-2\.1\.0\.json$/);
  });

  it('embeds the sbom-pilot tool identification', () => {
    const doc = emitSarif([], { creatorVersion: '1.2.3' });
    const run = (doc['runs'] as Array<{ tool: { driver: Record<string, unknown> } }>)[0]!;
    expect(run.tool.driver['name']).toBe('sbom-pilot');
    expect(run.tool.driver['version']).toBe('1.2.3');
    expect(run.tool.driver['informationUri']).toBe(
      'https://github.com/leagames0221-sys/sbom-pilot',
    );
  });

  it('emits a single run with no results when findings are empty', () => {
    const doc = emitSarif([]);
    const runs = doc['runs'] as Array<{ results: unknown[] }>;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.results).toEqual([]);
  });
});

describe('emitSarif — results + rules projection', () => {
  it('emits one result per finding', () => {
    const findings = [
      mkFinding('G-1', 'HIGH'),
      mkFinding('G-2', 'LOW'),
      mkFinding('G-3', 'MODERATE'),
    ];
    const doc = emitSarif(findings);
    const results = (doc['runs'] as Array<{ results: unknown[] }>)[0]!.results;
    expect(results).toHaveLength(3);
  });

  it('dedupes rules by advisoryId across multiple matching components', () => {
    // Same advisory hits two different components — only one rule, two results.
    const findings: Finding[] = [
      mkFinding('GHSA-x', 'HIGH', {
        componentId: 'a',
        componentName: 'a',
        componentPurl: 'pkg:npm/a@1.0.0',
      }),
      mkFinding('GHSA-x', 'HIGH', {
        componentId: 'b',
        componentName: 'b',
        componentPurl: 'pkg:npm/b@1.0.0',
      }),
    ];
    const doc = emitSarif(findings);
    const run = (doc['runs'] as Array<{
      tool: { driver: { rules: unknown[] } };
      results: unknown[];
    }>)[0]!;
    expect(run.tool.driver.rules).toHaveLength(1);
    expect(run.results).toHaveLength(2);
  });

  it('maps severity to SARIF level on each result', () => {
    const doc = emitSarif([
      mkFinding('G-1', 'CRITICAL'),
      mkFinding('G-2', 'LOW'),
    ]);
    const results = (
      doc['runs'] as Array<{ results: Array<{ level: string }> }>
    )[0]!.results;
    expect(results[0]?.level).toBe('error');
    expect(results[1]?.level).toBe('note');
  });

  it('embeds the suggestedUpgrade in the result message', () => {
    const doc = emitSarif([mkFinding('G-1', 'HIGH')]);
    const message = (
      doc['runs'] as Array<{
        results: Array<{ message: { text: string } }>;
      }>
    )[0]!.results[0]!.message.text;
    expect(message).toContain('Suggested upgrade: 1.1.0');
    expect(message).toContain('Affected: pkg@1.0.0');
  });

  it('pulls the rule helpUri from the first ADVISORY/WEB reference', () => {
    const doc = emitSarif([mkFinding('G-1', 'HIGH')]);
    const rule = (
      doc['runs'] as Array<{
        tool: { driver: { rules: Array<{ helpUri?: string }> } };
      }>
    )[0]!.tool.driver.rules[0]!;
    expect(rule.helpUri).toBe('https://example.com/G-1');
  });

  it('embeds purl as logicalLocations.fullyQualifiedName', () => {
    const doc = emitSarif([mkFinding('G-1', 'HIGH')]);
    const result = (
      doc['runs'] as Array<{
        results: Array<{
          locations: Array<{
            logicalLocations: Array<{ fullyQualifiedName: string; kind: string }>;
          }>;
        }>;
      }>
    )[0]!.results[0]!;
    expect(result.locations[0]?.logicalLocations[0]?.fullyQualifiedName).toBe(
      'pkg:npm/pkg@1.0.0',
    );
    expect(result.locations[0]?.logicalLocations[0]?.kind).toBe('package');
  });
});

describe('emitSarif — determinism (AC-002-7)', () => {
  it('serialises identically on repeat calls', () => {
    const findings = [
      mkFinding('G-1', 'HIGH'),
      mkFinding('G-2', 'MODERATE'),
    ];
    const a = serializeDocument(emitSarif(findings));
    const b = serializeDocument(emitSarif(findings));
    expect(a).toBe(b);
  });
});
