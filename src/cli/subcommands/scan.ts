/**
 * `sbom-pilot scan <project-dir>` — vulnerability scan + SARIF emit.
 *
 * Flow:
 *   1. dispatchParser(projectDir)                  (Layer 1)
 *   2. loadVulnDb(path)                             (Layer 3)
 *   3. correlate(ir, db)                            (Layer 3)
 *   4. dedupeByAdvisoryId + rankBySeverity          (Layer 3)
 *   5. emitSarif(findings)                          (Layer 4)
 *   6. validate('sarif-2.1.0', doc)                 (Layer 3)
 *   7. stderr summary (counts per severity)
 *   8. write SARIF to --output (atomic) or stdout
 *   9. --fail-on policy → exit code mapping
 *
 * Per ADR-0006: Layer 5 (CLI). No imports from CLI peers / siblings
 * outward.
 *
 * Spec mapping: AC-002-1..7, ADR-0005, ADR-0006.
 */
import { dispatchParser } from '../../parsers/index.js';
import {
  correlate,
  type Finding,
} from '../../scanners/correlator.js';
import {
  dedupeByAdvisoryId,
  rankBySeverity,
  shouldFailOn,
} from '../../scanners/severity.js';
import {
  formatStalenessWarning,
  loadVulnDb,
} from '../../scanners/vuln-db.js';
import { emitSarif } from '../../emitters/sarif-2.1.0.js';
import {
  computeDeterministicNamespace,
  serializeDocument,
} from '../../emitters/_shared.js';
import { atomicWrite } from '../../util/atomic-write.js';
import { validate } from '../../schemas/validate.js';
import {
  EX_DATAERR,
  EX_OK,
  EX_SOFTWARE,
  EX_TEMPFAIL,
} from '../../exit-codes.js';
import { readPackageVersion } from '../version.js';

export interface ScanCommandOptions {
  output?: string;
  failOn?: string;
  refresh?: boolean;
  vulnDb?: string;
}

export interface ScanActionContext {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exit: (code: number) => void;
}

/**
 * Default vuln-db location. Phase α convention: alongside the
 * project's `.sbom-pilot/` workspace dir. CLI-level override via
 * `--vuln-db <path>` and test injection via the same option.
 */
const DEFAULT_VULN_DB_RELATIVE = '.sbom-pilot/vuln-db.json';

function formatSummary(findings: ReadonlyArray<Finding>): string {
  const by = {
    CRITICAL: 0,
    HIGH: 0,
    MODERATE: 0,
    LOW: 0,
    UNKNOWN: 0,
  };
  for (const f of findings) by[f.severity] += 1;
  const total = findings.length;
  return `sbom-pilot scan summary: ${total} finding(s) — CRITICAL ${by.CRITICAL} / HIGH ${by.HIGH} / MODERATE ${by.MODERATE} / LOW ${by.LOW} / UNKNOWN ${by.UNKNOWN}`;
}

function parseFailOn(raw: string | undefined): string[] {
  if (raw === undefined || raw.length === 0) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Top-level action wired by commander in src/cli/index.ts.
 */
export async function scanAction(
  projectDir: string,
  options: ScanCommandOptions,
  ctx: ScanActionContext,
): Promise<void> {
  if (options.refresh === true) {
    // T-30 scope: refresh is a no-op stub. T-29 docs the actual refresh
    // script (scripts/refresh_vuln_db.ts) lands at T-29/T-30; we emit a
    // stderr advisory line so CI runs don't silently skip refresh.
    ctx.stderr(
      'sbom-pilot scan: --refresh requested but the refresh script is not yet wired. Loading the existing cache instead.',
    );
  }

  let ir;
  try {
    ir = await dispatchParser(projectDir, {
      namespace: computeDeterministicNamespace(projectDir, null, 'cyclonedx-1.5'),
      creatorVersion: readPackageVersion(),
    });
  } catch (e) {
    const err = e as Error & { exitCode?: number };
    ctx.stderr(`sbom-pilot scan: ${err.message}`);
    ctx.exit(err.exitCode ?? EX_DATAERR);
    return;
  }

  const vulnDbPath =
    options.vulnDb ?? `${projectDir}/${DEFAULT_VULN_DB_RELATIVE}`;
  let db;
  try {
    db = await loadVulnDb(vulnDbPath);
  } catch (e) {
    ctx.stderr(
      `sbom-pilot scan: cannot load vuln-db at ${vulnDbPath} (${(e as Error).message}). Pass --vuln-db <path> or run --refresh to populate.`,
    );
    ctx.exit(EX_DATAERR);
    return;
  }

  const stalenessWarning = formatStalenessWarning(db);
  if (stalenessWarning !== null) ctx.stderr(stalenessWarning);

  const raw = correlate(ir, db);
  const deduped = dedupeByAdvisoryId(raw);
  const ranked = rankBySeverity(deduped);

  ctx.stderr(formatSummary(ranked));

  const sarif = emitSarif(ranked, { creatorVersion: readPackageVersion() });
  const validation = validate('sarif-2.1.0', sarif);
  if (!validation.ok) {
    ctx.stderr(
      `sbom-pilot scan: generated SARIF failed schema validation (${validation.errors?.length ?? 0} error(s)). This is a bug — please file an issue.`,
    );
    ctx.exit(EX_SOFTWARE);
    return;
  }

  const content = serializeDocument(sarif);
  if (options.output !== undefined && options.output.length > 0) {
    await atomicWrite(options.output, content);
  } else {
    ctx.stdout(content.replace(/\n$/, ''));
  }

  const thresholds = parseFailOn(options.failOn);
  if (thresholds.length > 0 && shouldFailOn(ranked, thresholds)) {
    ctx.exit(EX_TEMPFAIL);
    return;
  }
  ctx.exit(EX_OK);
}
