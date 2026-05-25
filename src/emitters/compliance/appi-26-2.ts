/**
 * 改正個人情報保護法 第26条の2 (漏えい等の報告等) — incident-style
 * compliance report emitter.
 *
 * Input:  IR + scanner Finding[]
 * Output: 日本語 text report, UTF-8 without BOM.
 *
 * Report layout (AC-003-1 / AC-003-7):
 *   1. ヘッダー (プロジェクト名 / スキャン日時 / コンポーネント総数 /
 *      脆弱性検出件数)
 *   2. 【優先対応事項】 — 重大度 CRITICAL / HIGH の findings (priority
 *      disclosure section, AC-003-7)
 *   3. 【その他の検出事項】 — 重大度 MODERATE / LOW / UNKNOWN
 *   4. 脚注 — formatComplianceFooter('appi-26-2', creatorVersion)
 *
 * Per ADR-0006 §Decision: Layer 4 sub-module. Reads only IR (Layer 2)
 * + Finding type (Layer 3) + the compliance _shared / snippet helpers.
 *
 * AC-003-8 (UTF-8 no BOM): emitter returns a plain string. Callers
 * write via `atomicWrite(path, content)` which uses Node fs.writeFile
 * with utf8 encoding by default — no BOM is ever prepended.
 *
 * Spec mapping: AC-003-1, AC-003-7, AC-003-8, ADR-0005, ADR-0006.
 */
import type { SbomIR } from '../../ir/index.js';
import type { Finding } from '../../scanners/correlator.js';
import { compareSeverity, type OsvSeverityLabel } from '../../ir/severity.js';
import { formatComplianceFooter } from './_shared.js';

const PRIORITY_LABELS: ReadonlySet<OsvSeverityLabel> = new Set([
  'CRITICAL',
  'HIGH',
]);

const SEVERITY_DISPLAY: Readonly<Record<OsvSeverityLabel, string>> = {
  CRITICAL: '重大 (CRITICAL)',
  HIGH: '高 (HIGH)',
  MODERATE: '中 (MODERATE)',
  LOW: '低 (LOW)',
  UNKNOWN: '不明 (UNKNOWN)',
};

export interface AppiReportOptions {
  /**
   * Tool version used in the citation footer. Defaults to the IR's
   * `document.creatorVersion` when absent.
   */
  creatorVersion?: string;
}

/**
 * Render a single finding as the indented multi-line block that
 * appears under each section heading.
 */
function renderFinding(index: number, finding: Finding): string {
  const lines: string[] = [];
  lines.push(`  ${index}. ${finding.componentName}@${finding.componentVersion}`);
  lines.push(`     アドバイザリ ID: ${finding.advisoryId}`);
  if (finding.aliases.length > 0) {
    lines.push(`     CVE: ${finding.aliases.join(', ')}`);
  }
  lines.push(`     重大度: ${SEVERITY_DISPLAY[finding.severity]}`);
  if (finding.summary.length > 0) {
    lines.push(`     概要: ${finding.summary}`);
  }
  if (finding.suggestedUpgrade !== null) {
    lines.push(`     推奨対応: ${finding.suggestedUpgrade} 以降へアップグレード`);
  }
  const url = finding.references[0]?.url;
  if (url !== undefined) {
    lines.push(`     参照: ${url}`);
  }
  return lines.join('\n');
}

function renderSection(
  heading: string,
  findings: ReadonlyArray<Finding>,
  emptyMessage: string,
): string {
  const sep =
    '================================================================';
  const body =
    findings.length === 0
      ? `  ${emptyMessage}`
      : findings.map((f, i) => renderFinding(i + 1, f)).join('\n\n');
  return [sep, heading, sep, '', body, ''].join('\n');
}

/**
 * Emit the 改正個情法 26-2 report as a plain string.
 *
 * Returned string is intentionally newline-terminated (`\n` at end of
 * file) to match Unix text-file convention; downstream callers writing
 * via `atomicWrite` get the literal bytes including the final newline.
 *
 * The findings argument is consumed in input order; pass a
 * pre-ranked list (via {@link rankBySeverity}) for most-severe-first
 * ordering within each section. The emitter does an internal rank +
 * partition by priority severity itself so even an un-ranked input
 * produces the correct top-section / bottom-section split.
 */
export function emitAppi26_2Report(
  ir: SbomIR,
  findings: ReadonlyArray<Finding>,
  options: AppiReportOptions = {},
): string {
  const creatorVersion = options.creatorVersion ?? ir.document.creatorVersion;
  // Defensive rank: emitter is robust against un-ranked input. Sort
  // primitives come from the IR layer (src/ir/severity.ts) so this
  // import does not cross the ADR-0006 Emitters → Scanners edge.
  const ranked: Finding[] = [...findings].sort((a, b) =>
    compareSeverity(a.severity, b.severity),
  );
  const priority = ranked.filter((f) => PRIORITY_LABELS.has(f.severity));
  const other = ranked.filter((f) => !PRIORITY_LABELS.has(f.severity));

  const rootComponent =
    ir.components.find((c) => c.id === ir.document.rootComponent) ?? null;
  const projectLabel =
    rootComponent === null
      ? '不明 (root component 未指定)'
      : `${rootComponent.name}@${rootComponent.version}`;

  const header = [
    '個人情報保護法 第26条の2 報告書',
    '',
    `報告対象プロジェクト: ${projectLabel}`,
    `スキャン実施日時: ${ir.document.createdAt}`,
    `コンポーネント総数: ${ir.components.length}`,
    `脆弱性検出件数: ${findings.length}`,
    `内訳: 優先対応 ${priority.length} 件 / その他 ${other.length} 件`,
    '',
  ].join('\n');

  const prioritySection = renderSection(
    '【優先対応事項】 重大度 CRITICAL / HIGH の脆弱性',
    priority,
    '該当する脆弱性は検出されませんでした。',
  );

  const otherSection = renderSection(
    '【その他の検出事項】 重大度 MODERATE / LOW / UNKNOWN',
    other,
    '該当する脆弱性は検出されませんでした。',
  );

  const footer = [
    '----------------------------------------------------------------',
    formatComplianceFooter('appi-26-2', creatorVersion),
    '',
  ].join('\n');

  return [header, prioritySection, '', otherSection, '', footer].join('\n');
}
