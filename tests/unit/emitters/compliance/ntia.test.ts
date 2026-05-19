/**
 * Unit tests for the NTIA Minimum Elements reporter (T-25).
 *
 * Spec mapping: AC-003-3, AC-003-8, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { emitNtiaReport } from '../../../../src/emitters/compliance/ntia.js';
import type { SbomIR } from '../../../../src/ir/index.js';

const fullIR: SbomIR = {
  document: {
    namespace: 'urn:sbom-pilot:ntia:test',
    createdAt: '2026-05-20T00:00:00Z',
    creator: 'sbom-pilot',
    creatorVersion: '0.1.0',
    rootComponent: 'root',
  },
  components: [
    {
      id: 'root',
      purl: 'pkg:npm/example-app@1.0.0',
      name: 'example-app',
      version: '1.0.0',
      supplier: 'Example Corp',
      ecosystem: 'npm',
    },
    {
      id: 'node_modules/lodash',
      purl: 'pkg:npm/lodash@4.17.21',
      name: 'lodash',
      version: '4.17.21',
      supplier: 'OpenJS Foundation',
      ecosystem: 'npm',
    },
  ],
  relationships: [
    { from: 'root', to: 'node_modules/lodash', type: 'depends-on' },
  ],
};

describe('emitNtiaReport — document structure', () => {
  it('opens with the NTIA title line', () => {
    const out = emitNtiaReport(fullIR);
    expect(out.startsWith('NTIA Minimum Elements compliance report')).toBe(
      true,
    );
  });

  it('reports project label / scan timestamp / component total', () => {
    const out = emitNtiaReport(fullIR);
    expect(out).toContain('Project: example-app@1.0.0');
    expect(out).toContain('Scan timestamp: 2026-05-20T00:00:00Z');
    expect(out).toContain('Total components: 2');
  });

  it('ends with a trailing newline + carries no BOM', () => {
    const out = emitNtiaReport(fullIR);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe('emitNtiaReport — document-level elements (6, 7)', () => {
  it('marks Author + Timestamp PASS on a healthy IR', () => {
    const out = emitNtiaReport(fullIR);
    expect(out).toMatch(/\[PASS\]\s+Author of SBOM Data\s+sbom-pilot/);
    expect(out).toMatch(/\[PASS\]\s+Timestamp\s+2026-05-20T00:00:00Z/);
  });

  it('marks Timestamp FAIL when createdAt is unparseable', () => {
    const ir: SbomIR = {
      ...fullIR,
      document: { ...fullIR.document, createdAt: 'not-a-date' },
    };
    const out = emitNtiaReport(ir);
    expect(out).toMatch(/\[FAIL\]\s+Timestamp/);
  });
});

describe('emitNtiaReport — per-component elements (1-5)', () => {
  it('marks all 5 per-component fields PASS on a fully-populated component', () => {
    const out = emitNtiaReport(fullIR);
    const lodashStart = out.indexOf('lodash@4.17.21');
    const block = out.slice(lodashStart, lodashStart + 800);
    expect(block).toMatch(/\[PASS\]\s+Supplier Name\s+OpenJS Foundation/);
    expect(block).toMatch(/\[PASS\]\s+Component Name\s+lodash/);
    expect(block).toMatch(/\[PASS\]\s+Version of the Component\s+4\.17\.21/);
    expect(block).toMatch(/\[PASS\]\s+Other Unique Identifiers \(pURL\)\s+pkg:npm\/lodash@4\.17\.21/);
    expect(block).toMatch(/\[PASS\]\s+Dependency Relationship\s+1 edge\(s\) recorded/);
  });

  it('marks Supplier Name FAIL with literal "(not set)" when absent', () => {
    const ir: SbomIR = {
      ...fullIR,
      components: fullIR.components.map((c) => {
        const { supplier: _, ...rest } = c;
        void _;
        return rest;
      }),
    };
    const out = emitNtiaReport(ir);
    expect(out).toMatch(/\[FAIL\]\s+Supplier Name\s+\(not set\)/);
  });

  it('marks Dependency Relationship FAIL when no edges reference the component', () => {
    const ir: SbomIR = { ...fullIR, relationships: [] };
    const out = emitNtiaReport(ir);
    expect(out).toMatch(/\[FAIL\]\s+Dependency Relationship\s+no relationships recorded/);
  });
});

describe('emitNtiaReport — summary block', () => {
  it('reports total / PASS / FAIL / pass rate', () => {
    const out = emitNtiaReport(fullIR);
    // 2 document checks + 5 per-component × 2 components = 12
    expect(out).toContain('Total fields checked: 12');
    expect(out).toMatch(/PASS:\s+12/);
    expect(out).toMatch(/FAIL:\s+0/);
    expect(out).toContain('Pass rate:');
    expect(out).toContain('100.0%');
  });
});

describe('emitNtiaReport — citation footer', () => {
  it('appends the NTIA citation + tool tag at the end', () => {
    const out = emitNtiaReport(fullIR, { creatorVersion: '1.2.3' });
    expect(out).toContain('NTIA');
    expect(out).toContain('sbom-pilot-1.2.3');
  });
});

describe('emitNtiaReport — determinism', () => {
  it('emits identical bytes on repeat calls', () => {
    expect(emitNtiaReport(fullIR)).toBe(emitNtiaReport(fullIR));
  });
});
