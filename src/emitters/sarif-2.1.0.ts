/**
 * SARIF 2.1.0 emitter — Finding[] → SARIF document.
 *
 * SARIF (Static Analysis Results Interchange Format) is the OASIS
 * standard JSON shape consumed by GitHub Code Scanning, VS Code's
 * Problems panel, and most static-analysis aggregators. By emitting our
 * vuln-scan results in SARIF we get free integration with the
 * code-scanning UI on platforms that already speak it.
 *
 * Per ADR-0006 §Decision: Layer 4 (Emitters). Reads only the scanner
 * Finding type (Layer 3) + `_shared.ts` formatters. No parser / CLI
 * imports.
 *
 * Mapping (Finding → SARIF result):
 *
 *   componentId           → result.locations[].logicalLocations[].name
 *   componentPurl         → result.locations[].logicalLocations[].fullyQualifiedName
 *   advisoryId            → result.ruleId  (+ tool.driver.rules[] entry)
 *   severity              → result.level  (CRITICAL|HIGH → "error",
 *                                          MODERATE → "warning",
 *                                          LOW → "note",
 *                                          UNKNOWN → "none")
 *   summary               → result.message.text  (+ rule.shortDescription)
 *   suggestedUpgrade      → appended to result.message.text as a one-line
 *                            hint when present
 *   references[0]         → rule.helpUri (when category=ADVISORY/WEB)
 *
 * Tool identification matches the SPDX / CycloneDX emitters via the
 * shared `formatCitationFooter` (`Tool: sbom-pilot-<version>` minus the
 * `Tool: ` prefix for SARIF's structured fields).
 *
 * Spec mapping: AC-002-1, AC-002-4, AC-002-7, ADR-0005, ADR-0006.
 */
import type { OsvSeverityLabel } from '../scanners/vuln-db.js';
import type { Finding } from '../scanners/correlator.js';

const SARIF_VERSION = '2.1.0';
const SARIF_SCHEMA_URI =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';
const TOOL_NAME = 'sbom-pilot';
const TOOL_INFORMATION_URI =
  'https://github.com/leagames0221-sys/sbom-pilot';

export interface SarifEmitOptions {
  /**
   * Tool version emitted into `runs[0].tool.driver.version`. Defaults
   * to `'0.0.0-dev'` to match the IR document creator-version fallback;
   * the CLI threads the real package.json version through.
   */
  creatorVersion?: string;
}

export type SarifLevel = 'error' | 'warning' | 'note' | 'none';

/**
 * Map an OSV severity label onto a SARIF result level. CRITICAL and
 * HIGH both upgrade to `error` (the SARIF level set is coarser than OSV
 * — there is no `critical` tier).
 */
export function severityToSarifLevel(severity: OsvSeverityLabel): SarifLevel {
  switch (severity) {
    case 'CRITICAL':
    case 'HIGH':
      return 'error';
    case 'MODERATE':
      return 'warning';
    case 'LOW':
      return 'note';
    case 'UNKNOWN':
      return 'none';
  }
}

function pickHelpUri(finding: Finding): string | null {
  for (const ref of finding.references) {
    if (ref.type === 'ADVISORY' || ref.type === 'WEB') return ref.url;
  }
  return finding.references[0]?.url ?? null;
}

function ruleEntry(finding: Finding): Record<string, unknown> {
  const rule: Record<string, unknown> = {
    id: finding.advisoryId,
    name: finding.advisoryId,
    shortDescription: {
      text: finding.summary.length > 0 ? finding.summary : finding.advisoryId,
    },
  };
  const helpUri = pickHelpUri(finding);
  if (helpUri !== null) rule['helpUri'] = helpUri;
  return rule;
}

function buildResultMessage(finding: Finding): string {
  const parts: string[] = [];
  if (finding.summary.length > 0) parts.push(finding.summary);
  parts.push(
    `Affected: ${finding.componentName}@${finding.componentVersion}`,
  );
  if (finding.suggestedUpgrade !== null) {
    parts.push(`Suggested upgrade: ${finding.suggestedUpgrade}`);
  }
  if (finding.aliases.length > 0) {
    parts.push(`Aliases: ${finding.aliases.join(', ')}`);
  }
  return parts.join('. ');
}

function buildResult(finding: Finding): Record<string, unknown> {
  return {
    ruleId: finding.advisoryId,
    level: severityToSarifLevel(finding.severity),
    message: { text: buildResultMessage(finding) },
    locations: [
      {
        logicalLocations: [
          {
            name: `${finding.componentName}@${finding.componentVersion}`,
            fullyQualifiedName: finding.componentPurl,
            kind: 'package',
          },
        ],
      },
    ],
  };
}

/**
 * Emit findings as a SARIF 2.1.0 document object. The return value is
 * the fully-realised document (not yet serialised); callers wrap with
 * `serializeDocument` from src/emitters/_shared.ts when writing and
 * with `validate('sarif-2.1.0', doc)` when gating on schema conformance
 * (AC-002-4). Empty findings produce a structurally-valid SARIF with
 * an empty `results[]` array.
 *
 * The `tool.driver.rules[]` list is deduplicated on `advisoryId` so a
 * single advisory matched against N components produces one rules
 * entry and N results entries (one per match), which is what GitHub
 * Code Scanning and similar SARIF consumers expect.
 */
export function emitSarif(
  findings: ReadonlyArray<Finding>,
  options: SarifEmitOptions = {},
): Record<string, unknown> {
  const creatorVersion = options.creatorVersion ?? '0.0.0-dev';

  const rulesById = new Map<string, Record<string, unknown>>();
  const results: Array<Record<string, unknown>> = [];
  for (const finding of findings) {
    if (!rulesById.has(finding.advisoryId)) {
      rulesById.set(finding.advisoryId, ruleEntry(finding));
    }
    results.push(buildResult(finding));
  }
  const rules = [...rulesById.values()];

  return {
    $schema: SARIF_SCHEMA_URI,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: creatorVersion,
            informationUri: TOOL_INFORMATION_URI,
            rules,
          },
        },
        results,
      },
    ],
  };
}
