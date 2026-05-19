/**
 * Unit tests for the EU CRA Annex I §1 reporter (T-26).
 *
 * Spec mapping: AC-003-4, AC-003-8, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  emitEuCraReport,
  EuCraInputError,
} from '../../../../src/emitters/compliance/eu-cra.js';
import { EX_USAGE } from '../../../../src/exit-codes.js';
import type { SbomIR } from '../../../../src/ir/index.js';

const fullIR: SbomIR = {
  document: {
    namespace: 'urn:sbom-pilot:eu-cra:test',
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

describe('emitEuCraReport — format gating (AC-003-4)', () => {
  it('throws EuCraInputError when sbomFormat is spdx-2.3', () => {
    expect(() => emitEuCraReport(fullIR, { sbomFormat: 'spdx-2.3' })).toThrow(
      EuCraInputError,
    );
  });

  it('attaches exitCode = EX_USAGE on EuCraInputError', () => {
    try {
      emitEuCraReport(fullIR, { sbomFormat: 'spdx-2.3' });
      throw new Error('expected EuCraInputError');
    } catch (e) {
      expect(e).toBeInstanceOf(EuCraInputError);
      expect((e as EuCraInputError).exitCode).toBe(EX_USAGE);
    }
  });

  it('mentions --format cyclonedx in the error message (operator hint)', () => {
    try {
      emitEuCraReport(fullIR, { sbomFormat: 'spdx-2.3' });
      throw new Error('expected EuCraInputError');
    } catch (e) {
      expect((e as Error).message).toMatch(/cyclonedx/i);
    }
  });

  it('proceeds normally when sbomFormat is cyclonedx-1.5', () => {
    expect(() =>
      emitEuCraReport(fullIR, { sbomFormat: 'cyclonedx-1.5' }),
    ).not.toThrow();
  });

  it('proceeds normally when sbomFormat is omitted (default)', () => {
    expect(() => emitEuCraReport(fullIR)).not.toThrow();
  });
});

describe('emitEuCraReport — document structure', () => {
  it('opens with the CRA title line', () => {
    const out = emitEuCraReport(fullIR);
    expect(out.startsWith('EU Cyber Resilience Act — Annex I §1 checklist')).toBe(true);
  });

  it('reports regulation / project / scan timestamp / component total', () => {
    const out = emitEuCraReport(fullIR);
    expect(out).toContain('Regulation: ');
    expect(out).toContain('Project: example-app@1.0.0');
    expect(out).toContain('Scan timestamp: 2026-05-20T00:00:00Z');
    expect(out).toContain('Total components: 2');
  });

  it('ends with trailing newline + carries no BOM', () => {
    const out = emitEuCraReport(fullIR);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe('emitEuCraReport — checklist rows', () => {
  it('contains the seven Annex I Part 1 items', () => {
    const out = emitEuCraReport(fullIR);
    expect(out).toContain('Designed, developed and produced');
    expect(out).toContain('Delivered without known exploitable vulnerabilities');
    expect(out).toContain('Secure-by-default');
    expect(out).toContain('Vulnerability handling process');
    expect(out).toContain('SBOM of top-level dependencies');
    expect(out).toContain('Security updates available without charge');
    expect(out).toContain('Confidentiality + integrity');
  });

  it('marks SBOM-of-top-level-dependencies PASS when components > 0', () => {
    const out = emitEuCraReport(fullIR);
    // Find the SBOM-of-top-level row and assert the line above it has [PASS]
    const idx = out.indexOf('SBOM of top-level dependencies');
    const blockStart = out.lastIndexOf('[', idx);
    const verdictBlock = out.slice(blockStart, idx);
    expect(verdictBlock).toContain('[PASS');
  });

  it('marks SBOM-of-top-level-dependencies FAIL when components is empty', () => {
    const emptyIR: SbomIR = {
      ...fullIR,
      components: [],
      relationships: [],
    };
    const out = emitEuCraReport(emptyIR);
    const idx = out.indexOf('SBOM of top-level dependencies');
    const blockStart = out.lastIndexOf('[', idx);
    const verdictBlock = out.slice(blockStart, idx);
    expect(verdictBlock).toContain('[FAIL');
  });

  it('marks Confidentiality PASS when ≥ 50% components carry supplier', () => {
    // Both components carry supplier in fullIR → 100% → PASS
    const out = emitEuCraReport(fullIR);
    const idx = out.indexOf('Confidentiality + integrity');
    const blockStart = out.lastIndexOf('[', idx);
    const verdictBlock = out.slice(blockStart, idx);
    expect(verdictBlock).toContain('[PASS');
  });

  it('marks Confidentiality MANUAL when < 50% components carry supplier', () => {
    const noSupplierIR: SbomIR = {
      ...fullIR,
      components: fullIR.components.map((c) => {
        const { supplier: _, ...rest } = c;
        void _;
        return rest;
      }),
    };
    const out = emitEuCraReport(noSupplierIR);
    const idx = out.indexOf('Confidentiality + integrity');
    const blockStart = out.lastIndexOf('[', idx);
    const verdictBlock = out.slice(blockStart, idx);
    expect(verdictBlock).toContain('[MANUAL');
  });

  it('attaches evidence guidance to every MANUAL row', () => {
    const out = emitEuCraReport(fullIR);
    // Every MANUAL row must carry a "attach ..." or descriptive evidence line.
    expect(out).toContain('attach');
  });
});

describe('emitEuCraReport — summary', () => {
  it('reports Total / PASS / FAIL / MANUAL counts', () => {
    const out = emitEuCraReport(fullIR);
    expect(out).toContain('Total items:');
    expect(out).toContain('PASS:');
    expect(out).toContain('FAIL:');
    expect(out).toContain('MANUAL:');
    expect(out).toContain('evidence attachment required');
  });
});

describe('emitEuCraReport — citation footer', () => {
  it('appends the CRA citation + tool tag at the end', () => {
    const out = emitEuCraReport(fullIR, { creatorVersion: '1.2.3' });
    expect(out).toContain('Cyber Resilience Act');
    expect(out).toContain('sbom-pilot-1.2.3');
  });
});

describe('emitEuCraReport — determinism', () => {
  it('emits identical bytes on repeat calls', () => {
    expect(emitEuCraReport(fullIR)).toBe(emitEuCraReport(fullIR));
  });
});
