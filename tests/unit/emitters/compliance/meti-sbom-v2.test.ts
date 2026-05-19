/**
 * Unit tests for the METI SBOM v2.0 minimum-field validator (T-24).
 *
 * Spec mapping: AC-003-2, AC-003-8, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { emitMetiSbomV2Report } from '../../../../src/emitters/compliance/meti-sbom-v2.js';
import type { SbomIR } from '../../../../src/ir/index.js';

const fullIR: SbomIR = {
  document: {
    namespace: 'urn:sbom-pilot:meti:test',
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

const irMissingSupplier: SbomIR = {
  ...fullIR,
  components: fullIR.components.map((c) => {
    // Strip the supplier field entirely (not just empty) to test FAIL path.
    const { supplier: _, ...rest } = c;
    void _;
    return rest;
  }),
};

const irMissingDeps: SbomIR = {
  ...fullIR,
  relationships: [],
};

describe('emitMetiSbomV2Report — document structure', () => {
  it('opens with the METI title line', () => {
    const out = emitMetiSbomV2Report(fullIR);
    expect(out.startsWith('METI SBOM 導入手引き v2.0 最小要件 検証レポート')).toBe(true);
  });

  it('reports project label / scan timestamp / component total', () => {
    const out = emitMetiSbomV2Report(fullIR);
    expect(out).toContain('検証対象プロジェクト: example-app@1.0.0');
    expect(out).toContain('スキャン日時: 2026-05-20T00:00:00Z');
    expect(out).toContain('コンポーネント総数: 2');
  });

  it('ends with a trailing newline + carries no BOM', () => {
    const out = emitMetiSbomV2Report(fullIR);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe('emitMetiSbomV2Report — document-level checks', () => {
  it('marks 作者 (creator) as PASS when ir.document.creator = sbom-pilot', () => {
    const out = emitMetiSbomV2Report(fullIR);
    expect(out).toMatch(/\[PASS\] 作者 \(creator\): sbom-pilot/);
  });

  it('marks タイムスタンプ as PASS when createdAt is parseable', () => {
    const out = emitMetiSbomV2Report(fullIR);
    expect(out).toMatch(/\[PASS\] タイムスタンプ \(createdAt\): 2026-05-20T00:00:00Z/);
  });

  it('marks タイムスタンプ as FAIL when createdAt is unparseable', () => {
    const ir: SbomIR = {
      ...fullIR,
      document: { ...fullIR.document, createdAt: 'not-a-date' },
    };
    const out = emitMetiSbomV2Report(ir);
    expect(out).toMatch(/\[FAIL\] タイムスタンプ/);
  });
});

describe('emitMetiSbomV2Report — per-component checks (AC-003-2)', () => {
  it('marks every required field PASS on a fully-populated component', () => {
    const out = emitMetiSbomV2Report(fullIR);
    // Pull the lodash component block specifically
    const lodashStart = out.indexOf('lodash@4.17.21');
    const block = out.slice(lodashStart, lodashStart + 600);
    expect(block).toContain('[PASS] 製品/コンポーネント名: lodash');
    expect(block).toContain('[PASS] バージョン: 4.17.21');
    expect(block).toContain('[PASS] 供給者名: OpenJS Foundation');
    expect(block).toContain('[PASS] 識別子 (pURL): pkg:npm/lodash@4.17.21');
    expect(block).toContain('[PASS] 依存関係: 1 件のエッジ');
  });

  it('marks 供給者名 as FAIL with literal reason when supplier is absent', () => {
    const out = emitMetiSbomV2Report(irMissingSupplier);
    expect(out).toContain('[FAIL] 供給者名: 値が設定されていません');
  });

  it('marks 依存関係 as FAIL with literal reason when component has no edges', () => {
    const out = emitMetiSbomV2Report(irMissingDeps);
    expect(out).toContain(
      '[FAIL] 依存関係: 依存関係が記録されていません (リーフ または ルート未指定)',
    );
  });
});

describe('emitMetiSbomV2Report — summary block', () => {
  it('counts total / PASS / FAIL across document + per-component', () => {
    const out = emitMetiSbomV2Report(fullIR);
    // 2 document checks + 5 per-component checks × 2 components = 12
    expect(out).toContain('検証フィールド総数: 12');
    expect(out).toContain('PASS: 12 件');
    expect(out).toContain('FAIL: 0 件');
    expect(out).toContain('PASS率: 100.0%');
  });

  it('reflects a FAIL on the supplier-missing fixture', () => {
    const out = emitMetiSbomV2Report(irMissingSupplier);
    expect(out).toContain('FAIL: 2 件'); // 2 components × supplier FAIL
  });
});

describe('emitMetiSbomV2Report — citation footer', () => {
  it('appends the METI citation + tool tag at the end', () => {
    const out = emitMetiSbomV2Report(fullIR, { creatorVersion: '1.2.3' });
    expect(out).toContain('METI');
    expect(out).toContain('sbom-pilot-1.2.3');
  });
});

describe('emitMetiSbomV2Report — determinism', () => {
  it('emits identical bytes on repeat calls', () => {
    expect(emitMetiSbomV2Report(fullIR)).toBe(emitMetiSbomV2Report(fullIR));
  });
});
