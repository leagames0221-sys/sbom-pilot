/**
 * EU Cyber Resilience Act (Regulation (EU) 2024/2847) Annex I checklist
 * emitter — English compliance report.
 *
 * Input:  SbomIR
 * Output: English text checklist, UTF-8 without BOM.
 *
 * The EU CRA's Annex I §1 enumerates the "essential cybersecurity
 * requirements" a product with digital elements must meet. Most are
 * organisational / process attestations rather than SBOM-derived
 * facts, so the report renders each as a MANUAL-review row with a
 * literal explanation of what evidence the compliance officer must
 * attach. Two items the SBOM itself can speak to (presence of a
 * components inventory, presence of supplier identification) are
 * automatically PASS/FAIL'd.
 *
 * Format gating (AC-003-4):
 *   EU CRA Annex I §2(1) expects a SBOM in the CycloneDX format
 *   (machine-readable supply-chain inventory). When this emitter is
 *   invoked with `options.sbomFormat === 'spdx-2.3'` it throws an
 *   {@link EuCraInputError} carrying `exitCode = EX_USAGE`, which the
 *   CLI layer maps to a non-zero exit. Default and explicit-CycloneDX
 *   inputs proceed normally.
 *
 * Per ADR-0006 §Decision: Layer 4 sub-module. Reads IR (Layer 2) +
 * compliance _shared helpers + CRA snippet. The exit-codes import is
 * a cross-cutting leaf module per ADR-0006, allowed.
 *
 * Spec mapping: AC-003-4, AC-003-8, ADR-0005, ADR-0006.
 */
import type { SbomIR } from '../../ir/index.js';
import { EX_USAGE } from '../../exit-codes.js';
import {
  EU_CRA_ANNEX_I_PART_1_ITEMS,
  EU_CRA_SNIPPET,
} from './regulation-snippets/eu-cra.js';
import { formatComplianceFooter } from './_shared.js';

export interface EuCraReportOptions {
  creatorVersion?: string;
  /**
   * Format of the SBOM this report is being generated against. EU CRA
   * Annex I §2(1) expects CycloneDX; passing `'spdx-2.3'` raises
   * EuCraInputError. Omit (or pass `'cyclonedx-1.5'`) to proceed.
   */
  sbomFormat?: 'spdx-2.3' | 'cyclonedx-1.5';
}

/**
 * Thrown when {@link emitEuCraReport} is invoked with an unsupported
 * input format. The CLI layer (T-31) maps this to `EX_USAGE` so the
 * command exits with a meaningful code on bad-input misuse.
 */
export class EuCraInputError extends Error {
  readonly exitCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'EuCraInputError';
    this.exitCode = EX_USAGE;
  }
}

type Verdict = 'PASS' | 'FAIL' | 'MANUAL';

interface ChecklistRow {
  item: string;
  verdict: Verdict;
  evidence: string;
}

function pad(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

/**
 * Build the checklist rows from the static Annex I item list plus
 * SBOM-derived facts. Each row is either automatically scored or
 * tagged MANUAL with a one-line explanation of the evidence the
 * compliance officer must supply.
 */
function buildChecklist(ir: SbomIR): ChecklistRow[] {
  const componentCount = ir.components.length;
  const componentsWithSupplier = ir.components.filter(
    (c) => c.supplier !== undefined && c.supplier.length > 0,
  ).length;

  return EU_CRA_ANNEX_I_PART_1_ITEMS.map((item): ChecklistRow => {
    if (item.startsWith('SBOM of top-level dependencies')) {
      return {
        item,
        verdict: componentCount > 0 ? 'PASS' : 'FAIL',
        evidence:
          componentCount > 0
            ? `${componentCount} components present in this SBOM`
            : 'no components present — produce a SBOM before submitting',
      };
    }
    if (item.startsWith('Delivered without known exploitable vulnerabilities')) {
      return {
        item,
        verdict: 'MANUAL',
        evidence:
          'attach the latest `sbom-pilot scan` SARIF output + remediation plan for any HIGH/CRITICAL findings.',
      };
    }
    if (item.startsWith('Designed, developed and produced')) {
      return {
        item,
        verdict: 'MANUAL',
        evidence:
          'attach SDLC documentation showing security-by-design (threat modelling, code review, dependency policy).',
      };
    }
    if (item.startsWith('Secure-by-default')) {
      return {
        item,
        verdict: 'MANUAL',
        evidence:
          'attach default-configuration audit demonstrating no insecure defaults (open ports, default passwords, etc.).',
      };
    }
    if (item.startsWith('Vulnerability handling process')) {
      return {
        item,
        verdict: 'MANUAL',
        evidence:
          'attach SECURITY.md or equivalent describing vulnerability disclosure intake + remediation SLA.',
      };
    }
    if (item.startsWith('Security updates available without charge')) {
      return {
        item,
        verdict: 'MANUAL',
        evidence:
          'attach release notes / changelog showing free patch availability for the supported lifetime.',
      };
    }
    if (item.startsWith('Confidentiality + integrity')) {
      // Auto-checked: do at least 50% of components carry supplier identification?
      // Threshold is permissive — this is a heuristic, not a hard rule.
      const ratio = componentCount === 0 ? 0 : componentsWithSupplier / componentCount;
      const supplied = Math.round(ratio * 100);
      return {
        item,
        verdict: ratio >= 0.5 ? 'PASS' : 'MANUAL',
        evidence:
          ratio >= 0.5
            ? `${componentsWithSupplier}/${componentCount} components (${supplied}%) carry supplier identification.`
            : `only ${componentsWithSupplier}/${componentCount} components carry supplier identification — manual review recommended.`,
      };
    }
    return { item, verdict: 'MANUAL', evidence: '' };
  });
}

const ITEM_WIDTH = 78;
const VERDICT_WIDTH = 8;

function renderChecklist(rows: ReadonlyArray<ChecklistRow>): string {
  return rows
    .map((r) => {
      const folded =
        r.item.length <= ITEM_WIDTH
          ? r.item
          : `${r.item.slice(0, ITEM_WIDTH - 3)}...`;
      const header = `  [${pad(r.verdict, VERDICT_WIDTH - 2)}] ${folded}`;
      const evidence = r.evidence.length > 0 ? `             ${r.evidence}` : '';
      return [header, evidence].filter((s) => s.length > 0).join('\n');
    })
    .join('\n\n');
}

/**
 * Emit the EU CRA Annex I §1 checklist report.
 *
 * @throws {EuCraInputError} when `options.sbomFormat === 'spdx-2.3'`
 *   (carries `exitCode = EX_USAGE`).
 */
export function emitEuCraReport(
  ir: SbomIR,
  options: EuCraReportOptions = {},
): string {
  if (options.sbomFormat === 'spdx-2.3') {
    throw new EuCraInputError(
      'EU CRA Annex I expects a CycloneDX SBOM; the spdx-2.3 input is not accepted. Re-generate the SBOM with `--format cyclonedx` and re-run the report.',
    );
  }

  const creatorVersion = options.creatorVersion ?? ir.document.creatorVersion;
  const sep =
    '----------------------------------------------------------------';

  const rootComponent =
    ir.components.find((c) => c.id === ir.document.rootComponent) ?? null;
  const projectLabel =
    rootComponent === null
      ? 'unknown (root component not set)'
      : `${rootComponent.name}@${rootComponent.version}`;

  const rows = buildChecklist(ir);
  const pass = rows.filter((r) => r.verdict === 'PASS').length;
  const fail = rows.filter((r) => r.verdict === 'FAIL').length;
  const manual = rows.filter((r) => r.verdict === 'MANUAL').length;

  const header = [
    'EU Cyber Resilience Act — Annex I §1 checklist',
    '',
    `Regulation: ${EU_CRA_SNIPPET.title}`,
    `Project: ${projectLabel}`,
    `Scan timestamp: ${ir.document.createdAt}`,
    `Total components: ${ir.components.length}`,
    '',
    'Each row below is one essential cybersecurity requirement from',
    'Annex I §1. Rows marked PASS / FAIL are scored automatically from',
    'the SBOM; rows marked MANUAL require the compliance officer to',
    'attach the listed evidence.',
    '',
  ].join('\n');

  const checklistSection = [
    sep,
    'Annex I §1 essential cybersecurity requirements',
    sep,
    '',
    renderChecklist(rows),
    '',
  ].join('\n');

  const summarySection = [
    sep,
    'Summary',
    sep,
    '',
    `  Total items:  ${rows.length}`,
    `  PASS:         ${pass}`,
    `  FAIL:         ${fail}`,
    `  MANUAL:       ${manual}  (evidence attachment required)`,
    '',
  ].join('\n');

  const footer = [
    sep,
    formatComplianceFooter('eu-cra', creatorVersion),
    '',
  ].join('\n');

  return [header, checklistSection, summarySection, footer].join('\n');
}
