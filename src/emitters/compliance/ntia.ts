/**
 * NTIA Minimum Elements emitter — English compliance report.
 *
 * Input:  SbomIR
 * Output: English text validator report, UTF-8 without BOM.
 *
 * The NTIA "Minimum Elements For a Software Bill of Materials (SBOM)"
 * (July 2021, directed by Executive Order 14028) defines seven
 * mandatory minimum data fields per artifact + two document-level
 * fields. This emitter validates each IR component against those
 * seven and produces a PASS/FAIL table per artifact.
 *
 * The seven elements (in spec-published order):
 *   1. Supplier Name
 *   2. Component Name
 *   3. Version of the Component
 *   4. Other Unique Identifiers (we use pURL)
 *   5. Dependency Relationship
 *   6. Author of SBOM Data
 *   7. Timestamp
 *
 * Elements 6 + 7 are document-level (one check across the whole SBOM);
 * elements 1-5 are per-artifact (one check per component).
 *
 * Per ADR-0006 §Decision: Layer 4 sub-module. Reads IR (Layer 2) +
 * compliance _shared helpers + NTIA snippet.
 *
 * Spec mapping: AC-003-3, AC-003-8, ADR-0005, ADR-0006.
 */
import type { Component, SbomIR } from '../../ir/index.js';
import { formatComplianceFooter } from './_shared.js';

export interface NtiaReportOptions {
  creatorVersion?: string;
}

interface FieldCheck {
  label: string;
  pass: boolean;
  detail: string;
}

const PASS = 'PASS';
const FAIL = 'FAIL';

function pad(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

function checkComponent(
  component: Component,
  edgeCount: number,
): FieldCheck[] {
  const supplier = component.supplier;
  const supplierPresent = supplier !== undefined && supplier.length > 0;

  return [
    {
      label: 'Supplier Name',
      pass: supplierPresent,
      detail: supplierPresent
        ? (supplier as string)
        : '(not set)',
    },
    {
      label: 'Component Name',
      pass: component.name.length > 0,
      detail: component.name.length > 0 ? component.name : '(not set)',
    },
    {
      label: 'Version of the Component',
      pass: component.version.length > 0,
      detail: component.version.length > 0 ? component.version : '(not set)',
    },
    {
      label: 'Other Unique Identifiers (pURL)',
      pass: component.purl.length > 0,
      detail: component.purl.length > 0 ? component.purl : '(not set)',
    },
    {
      label: 'Dependency Relationship',
      pass: edgeCount > 0,
      detail:
        edgeCount > 0
          ? `${edgeCount} edge(s) recorded`
          : 'no relationships recorded (leaf or unset root)',
    },
  ];
}

function checkDocument(ir: SbomIR): FieldCheck[] {
  return [
    {
      label: 'Author of SBOM Data',
      pass: ir.document.creator === 'sbom-pilot',
      detail: ir.document.creator,
    },
    {
      label: 'Timestamp',
      pass: !Number.isNaN(Date.parse(ir.document.createdAt)),
      detail: ir.document.createdAt,
    },
  ];
}

function edgeCountByComponent(ir: SbomIR): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rel of ir.relationships) {
    counts.set(rel.from, (counts.get(rel.from) ?? 0) + 1);
    counts.set(rel.to, (counts.get(rel.to) ?? 0) + 1);
  }
  return counts;
}

const LABEL_WIDTH = 36;

function renderChecks(checks: ReadonlyArray<FieldCheck>): string {
  return checks
    .map(
      (c) =>
        `    [${c.pass ? PASS : FAIL}]  ${pad(c.label, LABEL_WIDTH)} ${c.detail}`,
    )
    .join('\n');
}

/**
 * Emit the NTIA Minimum Elements compliance report.
 */
export function emitNtiaReport(
  ir: SbomIR,
  options: NtiaReportOptions = {},
): string {
  const creatorVersion = options.creatorVersion ?? ir.document.creatorVersion;
  const edges = edgeCountByComponent(ir);
  const sep =
    '----------------------------------------------------------------';

  const rootComponent =
    ir.components.find((c) => c.id === ir.document.rootComponent) ?? null;
  const projectLabel =
    rootComponent === null
      ? 'unknown (root component not set)'
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
    'NTIA Minimum Elements compliance report',
    '',
    `Project: ${projectLabel}`,
    `Scan timestamp: ${ir.document.createdAt}`,
    `Total components: ${ir.components.length}`,
    '',
  ].join('\n');

  const documentSection = [
    sep,
    'Document-level elements (6, 7)',
    sep,
    '',
    renderChecks(documentChecks),
    '',
  ].join('\n');

  const perComponentSection = [
    sep,
    'Per-component elements (1, 2, 3, 4, 5)',
    sep,
    '',
    perComponentChecks
      .map(
        (pc) =>
          `  - ${pc.component.name}@${pc.component.version}\n${renderChecks(pc.checks)}`,
      )
      .join('\n\n'),
    '',
  ].join('\n');

  const summarySection = [
    sep,
    'Summary',
    sep,
    '',
    `  Total fields checked: ${totalChecks}`,
    `  PASS:                  ${totalPass}`,
    `  FAIL:                  ${totalFail}`,
    `  Pass rate:             ${totalChecks === 0 ? '—' : `${((totalPass / totalChecks) * 100).toFixed(1)}%`}`,
    '',
  ].join('\n');

  const footer = [
    sep,
    formatComplianceFooter('ntia', creatorVersion),
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
