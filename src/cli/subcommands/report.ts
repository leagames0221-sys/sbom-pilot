/**
 * `sbom-pilot report <project-dir> --standard <name>` — compliance
 * report dispatcher.
 *
 * Routes to one of the four L6 reporters based on `--standard`:
 *
 *   appi-26-2     → emitAppi26_2Report      (日本語, incident-style)
 *   meti-sbom-v2  → emitMetiSbomV2Report    (日本語, validator)
 *   ntia          → emitNtiaReport          (English, NTIA elements)
 *   eu-cra        → emitEuCraReport         (English, Annex I checklist)
 *
 * Without `--standard`, the command lists the 4 valid options and
 * exits EX_USAGE.
 *
 * The 改正個情法 (appi-26-2) reporter requires scanner findings to
 * populate the priority-disclosure section, so this subcommand runs
 * the scanner pipeline for it. Other reporters work off the IR
 * alone — for them the vuln-db is optional (warn if missing,
 * proceed with an empty findings list).
 *
 * Per ADR-0006 §Decision: Layer 5 (CLI). Consumes parsers / scanners
 * / compliance emitters through their barrel re-exports.
 *
 * Spec mapping: AC-003-1..8, AC-005-1, ADR-0005, ADR-0006.
 */
import { dispatchParser } from '../../parsers/index.js';
import { loadVulnDb } from '../../scanners/vuln-db.js';
import { correlate, type Finding } from '../../scanners/correlator.js';
import {
  dedupeByAdvisoryId,
  rankBySeverity,
} from '../../scanners/severity.js';
import { emitAppi26_2Report } from '../../emitters/compliance/appi-26-2.js';
import { emitMetiSbomV2Report } from '../../emitters/compliance/meti-sbom-v2.js';
import { emitNtiaReport } from '../../emitters/compliance/ntia.js';
import {
  emitEuCraReport,
  EuCraInputError,
} from '../../emitters/compliance/eu-cra.js';
import { computeDeterministicNamespace } from '../../emitters/_shared.js';
import { atomicWrite } from '../../util/atomic-write.js';
import {
  EX_DATAERR,
  EX_OK,
  EX_USAGE,
} from '../../exit-codes.js';
import { readPackageVersion } from '../version.js';

export type ReportStandard = 'appi-26-2' | 'meti-sbom-v2' | 'ntia' | 'eu-cra';

const STANDARD_NAMES: ReadonlyArray<ReportStandard> = [
  'appi-26-2',
  'meti-sbom-v2',
  'ntia',
  'eu-cra',
];

export interface ReportCommandOptions {
  standard?: string;
  output?: string;
  vulnDb?: string;
  /**
   * Forwarded to the EU CRA emitter only — when an outer pipeline has
   * already produced an SPDX SBOM, the operator can pass
   * --sbom-format spdx to surface the EU CRA's CycloneDX-only
   * constraint at this layer (EX_USAGE on rejection).
   */
  sbomFormat?: string;
}

export interface ReportActionContext {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exit: (code: number) => void;
}

function isReportStandard(s: string): s is ReportStandard {
  return STANDARD_NAMES.includes(s as ReportStandard);
}

export async function reportAction(
  projectDir: string,
  options: ReportCommandOptions,
  ctx: ReportActionContext,
): Promise<void> {
  const standard = options.standard;
  if (standard === undefined || standard.length === 0) {
    ctx.stderr(
      `sbom-pilot report: --standard is required. Accepted: ${STANDARD_NAMES.join(' | ')}`,
    );
    ctx.exit(EX_USAGE);
    return;
  }
  if (!isReportStandard(standard)) {
    ctx.stderr(
      `sbom-pilot report: unknown --standard "${standard}" (accepted: ${STANDARD_NAMES.join(' | ')})`,
    );
    ctx.exit(EX_USAGE);
    return;
  }

  let ir;
  try {
    ir = await dispatchParser(projectDir, {
      namespace: computeDeterministicNamespace(projectDir, null, 'cyclonedx-1.5'),
      creatorVersion: readPackageVersion(),
    });
  } catch (e) {
    const err = e as Error & { exitCode?: number };
    ctx.stderr(`sbom-pilot report: ${err.message}`);
    ctx.exit(err.exitCode ?? EX_DATAERR);
    return;
  }

  let findings: Finding[] = [];
  if (standard === 'appi-26-2') {
    const vulnDbPath =
      options.vulnDb ?? `${projectDir}/.sbom-pilot/vuln-db.json`;
    try {
      const db = await loadVulnDb(vulnDbPath);
      findings = rankBySeverity(dedupeByAdvisoryId(correlate(ir, db)));
    } catch {
      ctx.stderr(
        `sbom-pilot report: vuln-db not loadable at ${vulnDbPath}; appi-26-2 report will list no incidents. Pass --vuln-db <path> to seed.`,
      );
    }
  }

  let content: string;
  const creatorVersion = readPackageVersion();
  try {
    switch (standard) {
      case 'appi-26-2':
        content = emitAppi26_2Report(ir, findings, { creatorVersion });
        break;
      case 'meti-sbom-v2':
        content = emitMetiSbomV2Report(ir, { creatorVersion });
        break;
      case 'ntia':
        content = emitNtiaReport(ir, { creatorVersion });
        break;
      case 'eu-cra': {
        const sbomFormat = options.sbomFormat;
        const opts: Parameters<typeof emitEuCraReport>[1] = { creatorVersion };
        if (sbomFormat === 'spdx-2.3' || sbomFormat === 'cyclonedx-1.5') {
          opts.sbomFormat = sbomFormat;
        }
        content = emitEuCraReport(ir, opts);
        break;
      }
    }
  } catch (e) {
    if (e instanceof EuCraInputError) {
      ctx.stderr(`sbom-pilot report: ${e.message}`);
      ctx.exit(e.exitCode);
      return;
    }
    throw e;
  }

  if (options.output !== undefined && options.output.length > 0) {
    await atomicWrite(options.output, content);
  } else {
    ctx.stdout(content.replace(/\n$/, ''));
  }
  ctx.exit(EX_OK);
}
