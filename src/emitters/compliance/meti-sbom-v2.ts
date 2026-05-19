/**
 * METI SBOM 導入手引き v2.0 — minimum-field validator emitter.
 *
 * Input:  SbomIR
 * Output: 日本語 text validator report, UTF-8 without BOM.
 *
 * Unlike the 改正個情法 reporter (T-23) which surfaces vulnerability
 * findings, this emitter validates each IR component against the
 * METI guideline's seven minimum required fields per component plus
 * the two document-level fields. Each field gets a `[PASS]` or
 * `[FAIL]` marker with a literal reason on FAIL.
 *
 * METI v2.0 minimum fields (per 経済産業省, ソフトウェア管理に向けた SBOM
 * の導入に関する手引 v2.0, 令和6年8月):
 *
 *   Per component:
 *     1. 製品/コンポーネント名 (Component Name)
 *     2. バージョン (Version)
 *     3. 供給者名 (Supplier)
 *     4. 識別子 (Unique Identifier — pURL or equivalent)
 *     5. 依存関係 (Dependency Relationship — at least one edge to/from
 *        the component when it is not a leaf)
 *
 *   Per document:
 *     6. 作者 (SBOM Author / Creator)
 *     7. タイムスタンプ (Generation Timestamp)
 *
 * Per ADR-0006 §Decision: Layer 4 sub-module. Reads only IR (Layer 2)
 * + compliance _shared helpers.
 *
 * Spec mapping: AC-003-2, AC-003-8, ADR-0005, ADR-0006.
 */
import type { Component, SbomIR } from '../../ir/index.js';
import { formatComplianceFooter } from './_shared.js';

export interface MetiReportOptions {
  creatorVersion?: string;
}

interface FieldCheck {
  label: string;
  pass: boolean;
  detail: string;
}

const PASS_TAG = '[PASS]';
const FAIL_TAG = '[FAIL]';

function checkComponent(
  component: Component,
  edgeCount: number,
): FieldCheck[] {
  const checks: FieldCheck[] = [];

  checks.push({
    label: '製品/コンポーネント名',
    pass: component.name.length > 0,
    detail:
      component.name.length > 0
        ? component.name
        : '値が設定されていません',
  });

  checks.push({
    label: 'バージョン',
    pass: component.version.length > 0,
    detail:
      component.version.length > 0
        ? component.version
        : '値が設定されていません',
  });

  const supplier = component.supplier;
  const supplierPresent =
    supplier !== undefined && supplier.length > 0;
  checks.push({
    label: '供給者名',
    pass: supplierPresent,
    detail: supplierPresent
      ? (supplier as string)
      : '値が設定されていません',
  });

  checks.push({
    label: '識別子 (pURL)',
    pass: component.purl.length > 0,
    detail:
      component.purl.length > 0
        ? component.purl
        : '値が設定されていません',
  });

  checks.push({
    label: '依存関係',
    pass: edgeCount > 0,
    detail:
      edgeCount > 0
        ? `${edgeCount} 件のエッジ`
        : '依存関係が記録されていません (リーフ または ルート未指定)',
  });

  return checks;
}

function checkDocument(ir: SbomIR): FieldCheck[] {
  const checks: FieldCheck[] = [];

  checks.push({
    label: '作者 (creator)',
    pass: ir.document.creator === 'sbom-pilot',
    detail: ir.document.creator,
  });

  checks.push({
    label: 'タイムスタンプ (createdAt)',
    pass: !Number.isNaN(Date.parse(ir.document.createdAt)),
    detail: ir.document.createdAt,
  });

  return checks;
}

function renderChecks(checks: ReadonlyArray<FieldCheck>): string {
  return checks
    .map(
      (c) =>
        `    ${c.pass ? PASS_TAG : FAIL_TAG} ${c.label}: ${c.detail}`,
    )
    .join('\n');
}

/**
 * Build a per-component edge-count map: for each component id, the
 * number of relationships in which it appears as `from` or `to`.
 */
function edgeCountByComponent(ir: SbomIR): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rel of ir.relationships) {
    counts.set(rel.from, (counts.get(rel.from) ?? 0) + 1);
    counts.set(rel.to, (counts.get(rel.to) ?? 0) + 1);
  }
  return counts;
}

/**
 * Emit the METI SBOM v2.0 minimum-field validator report.
 */
export function emitMetiSbomV2Report(
  ir: SbomIR,
  options: MetiReportOptions = {},
): string {
  const creatorVersion = options.creatorVersion ?? ir.document.creatorVersion;
  const edges = edgeCountByComponent(ir);

  const sep =
    '----------------------------------------------------------------';

  const rootComponent =
    ir.components.find((c) => c.id === ir.document.rootComponent) ?? null;
  const projectLabel =
    rootComponent === null
      ? '不明 (root component 未指定)'
      : `${rootComponent.name}@${rootComponent.version}`;

  const documentChecks = checkDocument(ir);
  const perComponentChecks = ir.components.map((c) => ({
    component: c,
    checks: checkComponent(c, edges.get(c.id) ?? 0),
  }));

  let totalChecks = documentChecks.length;
  let totalPass = documentChecks.filter((c) => c.pass).length;
  for (const pc of perComponentChecks) {
    totalChecks += pc.checks.length;
    totalPass += pc.checks.filter((c) => c.pass).length;
  }
  const totalFail = totalChecks - totalPass;

  const header = [
    'METI SBOM 導入手引き v2.0 最小要件 検証レポート',
    '',
    `検証対象プロジェクト: ${projectLabel}`,
    `スキャン日時: ${ir.document.createdAt}`,
    `コンポーネント総数: ${ir.components.length}`,
    '',
  ].join('\n');

  const documentSection = [
    sep,
    'ドキュメントレベル 検証結果',
    sep,
    '',
    renderChecks(documentChecks),
    '',
  ].join('\n');

  const perComponentSection = [
    sep,
    'コンポーネント別 検証結果',
    sep,
    '',
    perComponentChecks
      .map(
        (pc) =>
          `  ・${pc.component.name}@${pc.component.version}\n${renderChecks(pc.checks)}`,
      )
      .join('\n\n'),
    '',
  ].join('\n');

  const summarySection = [
    sep,
    '集計',
    sep,
    '',
    `  検証フィールド総数: ${totalChecks}`,
    `  PASS: ${totalPass} 件`,
    `  FAIL: ${totalFail} 件`,
    `  PASS率: ${totalChecks === 0 ? '—' : `${((totalPass / totalChecks) * 100).toFixed(1)}%`}`,
    '',
  ].join('\n');

  const footer = [
    sep,
    formatComplianceFooter('meti-sbom-v2', creatorVersion),
    '',
  ].join('\n');

  return [
    header,
    documentSection,
    perComponentSection,
    summarySection,
    footer,
  ].join('\n');
}
