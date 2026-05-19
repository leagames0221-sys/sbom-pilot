/**
 * Unit tests for the 改正個情法 26-2 reporter (T-23).
 *
 * Spec mapping: AC-003-1, AC-003-7, AC-003-8, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { emitAppi26_2Report } from '../../../../src/emitters/compliance/appi-26-2.js';
import type { SbomIR } from '../../../../src/ir/index.js';
import type { Finding } from '../../../../src/scanners/correlator.js';
import type { OsvSeverityLabel } from '../../../../src/scanners/vuln-db.js';

const baseIR: SbomIR = {
  document: {
    namespace: 'urn:sbom-pilot:appi:test',
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
      ecosystem: 'npm',
    },
    {
      id: 'node_modules/lodash',
      purl: 'pkg:npm/lodash@4.17.21',
      name: 'lodash',
      version: '4.17.21',
      ecosystem: 'npm',
    },
  ],
  relationships: [],
};

function mkFinding(
  advisoryId: string,
  severity: OsvSeverityLabel,
  componentName: string,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    componentId: `node_modules/${componentName}`,
    componentPurl: `pkg:npm/${componentName}@1.0.0`,
    componentName,
    componentVersion: '1.0.0',
    advisoryId,
    aliases: ['CVE-2026-99000'],
    severity,
    summary: `合成脆弱性: ${advisoryId}`,
    affectedRange: { introduced: '0.0.0', fixed: '1.1.0' },
    suggestedUpgrade: '1.1.0',
    references: [{ type: 'ADVISORY', url: `https://example.com/${advisoryId}` }],
    ...overrides,
  };
}

describe('emitAppi26_2Report — document structure', () => {
  it('opens with the regulation title line in Japanese', () => {
    const out = emitAppi26_2Report(baseIR, []);
    expect(out.startsWith('個人情報保護法 第26条の2 報告書')).toBe(true);
  });

  it('reports the project label as <name>@<version> of the root component', () => {
    const out = emitAppi26_2Report(baseIR, []);
    expect(out).toContain('報告対象プロジェクト: example-app@1.0.0');
  });

  it('echoes the IR scan timestamp verbatim', () => {
    const out = emitAppi26_2Report(baseIR, []);
    expect(out).toContain('スキャン実施日時: 2026-05-20T00:00:00Z');
  });

  it('reports component total + findings count + breakdown', () => {
    const findings = [
      mkFinding('G-1', 'HIGH', 'lodash'),
      mkFinding('G-2', 'LOW', 'chalk'),
    ];
    const out = emitAppi26_2Report(baseIR, findings);
    expect(out).toContain('コンポーネント総数: 2');
    expect(out).toContain('脆弱性検出件数: 2');
    expect(out).toContain('内訳: 優先対応 1 件 / その他 1 件');
  });

  it('ends with a trailing newline (Unix convention)', () => {
    const out = emitAppi26_2Report(baseIR, []);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('contains no BOM character (AC-003-8)', () => {
    const out = emitAppi26_2Report(baseIR, []);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe('emitAppi26_2Report — priority section (AC-003-7)', () => {
  it('places CRITICAL + HIGH findings in the 優先対応事項 section', () => {
    const findings = [
      mkFinding('G-LOW', 'LOW', 'chalk'),
      mkFinding('G-HIGH', 'HIGH', 'lodash'),
      mkFinding('G-CRIT', 'CRITICAL', 'express'),
    ];
    const out = emitAppi26_2Report(baseIR, findings);

    const priorityStart = out.indexOf('【優先対応事項】');
    const otherStart = out.indexOf('【その他の検出事項】');
    expect(priorityStart).toBeGreaterThan(0);
    expect(otherStart).toBeGreaterThan(priorityStart);

    const prioritySection = out.slice(priorityStart, otherStart);
    expect(prioritySection).toContain('G-HIGH');
    expect(prioritySection).toContain('G-CRIT');
    expect(prioritySection).not.toContain('G-LOW');

    const otherSection = out.slice(otherStart);
    expect(otherSection).toContain('G-LOW');
  });

  it('ranks priority findings most-severe-first (CRITICAL before HIGH)', () => {
    const findings = [
      mkFinding('G-HIGH', 'HIGH', 'lodash'),
      mkFinding('G-CRIT', 'CRITICAL', 'express'),
    ];
    const out = emitAppi26_2Report(baseIR, findings);
    const critIdx = out.indexOf('G-CRIT');
    const highIdx = out.indexOf('G-HIGH');
    expect(critIdx).toBeLessThan(highIdx);
  });

  it('shows the empty-section message when no priority findings exist', () => {
    const findings = [mkFinding('G-LOW', 'LOW', 'chalk')];
    const out = emitAppi26_2Report(baseIR, findings);
    const priorityStart = out.indexOf('【優先対応事項】');
    const otherStart = out.indexOf('【その他の検出事項】');
    const prioritySection = out.slice(priorityStart, otherStart);
    expect(prioritySection).toContain('該当する脆弱性は検出されませんでした');
  });
});

describe('emitAppi26_2Report — finding block fields', () => {
  it('renders advisory id, CVE alias, severity, summary, upgrade hint, reference', () => {
    const findings = [mkFinding('GHSA-xxx-yyy', 'HIGH', 'lodash')];
    const out = emitAppi26_2Report(baseIR, findings);
    expect(out).toContain('lodash@1.0.0');
    expect(out).toContain('アドバイザリ ID: GHSA-xxx-yyy');
    expect(out).toContain('CVE: CVE-2026-99000');
    expect(out).toContain('重大度: 高 (HIGH)');
    expect(out).toContain('概要: 合成脆弱性: GHSA-xxx-yyy');
    expect(out).toContain('推奨対応: 1.1.0 以降へアップグレード');
    expect(out).toContain('参照: https://example.com/GHSA-xxx-yyy');
  });

  it('omits the CVE line when aliases array is empty', () => {
    const findings = [
      mkFinding('GHSA-no-cve', 'HIGH', 'lodash', { aliases: [] }),
    ];
    const out = emitAppi26_2Report(baseIR, findings);
    expect(out).not.toContain('CVE: ');
  });

  it('omits the upgrade line when suggestedUpgrade is null', () => {
    const findings = [
      mkFinding('GHSA-no-fix', 'HIGH', 'lodash', { suggestedUpgrade: null }),
    ];
    const out = emitAppi26_2Report(baseIR, findings);
    expect(out).not.toContain('推奨対応');
  });

  it('omits the reference line when references array is empty', () => {
    const findings = [
      mkFinding('GHSA-no-ref', 'HIGH', 'lodash', { references: [] }),
    ];
    const out = emitAppi26_2Report(baseIR, findings);
    expect(out).not.toContain('参照: ');
  });
});

describe('emitAppi26_2Report — citation footer', () => {
  it('appends the appi-26-2 citation + tool-tag footer at the end', () => {
    const out = emitAppi26_2Report(baseIR, [], { creatorVersion: '1.2.3' });
    expect(out).toContain('改正個人情報保護法 第26条の2');
    expect(out).toContain('sbom-pilot-1.2.3');
  });

  it('falls back to IR creatorVersion when options.creatorVersion is absent', () => {
    const out = emitAppi26_2Report(baseIR, []);
    expect(out).toContain('sbom-pilot-0.1.0');
  });
});

describe('emitAppi26_2Report — determinism', () => {
  it('emits identical bytes on repeat calls for the same input', () => {
    const findings = [
      mkFinding('G-HIGH', 'HIGH', 'lodash'),
      mkFinding('G-LOW', 'LOW', 'chalk'),
    ];
    const a = emitAppi26_2Report(baseIR, findings);
    const b = emitAppi26_2Report(baseIR, findings);
    expect(a).toBe(b);
  });
});
