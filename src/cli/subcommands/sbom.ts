/**
 * `sbom-pilot sbom <project-dir>` — emit a SBOM document.
 *
 * Flow (per ADR-0006 layer order):
 *   1. dispatchParser(projectDir)                  (Layer 1)
 *   2. emit{Spdx,CycloneDx}(ir)                    (Layer 4)
 *   3. validate('<format>', doc)                   (schemas/, Layer 3)
 *   4. serializeDocument(doc) → string
 *   5. write to --output (atomic) or stdout
 *
 * Per ADR-0006: CLI (Layer 5) consumes parsers / emitters / schemas
 * through their barrel re-exports. Nothing from inside this file
 * imports CLI-internal symbols outward.
 *
 * Spec mapping: AC-001-1..8, ADR-0005, ADR-0006.
 */
import { dispatchParser } from '../../parsers/index.js';
import { emitSpdx } from '../../emitters/spdx-2.3.js';
import { emitCycloneDx } from '../../emitters/cyclonedx-1.5.js';
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
  EX_USAGE,
} from '../../exit-codes.js';
import { readPackageVersion } from '../version.js';

export type SbomFormat = 'spdx' | 'cyclonedx';

export interface SbomCommandOptions {
  format?: string;
  output?: string;
}

export interface SbomActionContext {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exit: (code: number) => void;
}

const FORMAT_ALIAS: Readonly<Record<string, SbomFormat>> = {
  spdx: 'spdx',
  'spdx-2.3': 'spdx',
  cyclonedx: 'cyclonedx',
  'cyclonedx-1.5': 'cyclonedx',
  cdx: 'cyclonedx',
};

function resolveFormat(raw: string | undefined): SbomFormat | null {
  if (raw === undefined) return 'spdx';
  const lower = raw.toLowerCase();
  return FORMAT_ALIAS[lower] ?? null;
}

/**
 * Top-level action wired by commander in src/cli/index.ts.
 */
export async function sbomAction(
  projectDir: string,
  options: SbomCommandOptions,
  ctx: SbomActionContext,
): Promise<void> {
  const format = resolveFormat(options.format);
  if (format === null) {
    ctx.stderr(
      `sbom-pilot sbom: unknown --format "${options.format}" (accepted: spdx | cyclonedx)`,
    );
    ctx.exit(EX_USAGE);
    return;
  }

  let ir;
  try {
    const namespaceFormat = format === 'spdx' ? 'spdx-2.3' : 'cyclonedx-1.5';
    ir = await dispatchParser(projectDir, {
      namespace: computeDeterministicNamespace(projectDir, null, namespaceFormat),
      creatorVersion: readPackageVersion(),
    });
  } catch (e) {
    const err = e as Error & { exitCode?: number };
    ctx.stderr(`sbom-pilot sbom: ${err.message}`);
    ctx.exit(err.exitCode ?? EX_DATAERR);
    return;
  }

  const doc = format === 'spdx' ? emitSpdx(ir) : emitCycloneDx(ir);
  const schemaFormat = format === 'spdx' ? 'spdx-2.3' : 'cyclonedx-1.5';
  const validation = validate(schemaFormat, doc);
  if (!validation.ok) {
    ctx.stderr(
      `sbom-pilot sbom: generated ${schemaFormat} document failed schema validation (${validation.errors?.length ?? 0} error(s)). This is a bug — please file an issue.`,
    );
    ctx.exit(EX_SOFTWARE);
    return;
  }

  const content = serializeDocument(doc);
  if (options.output !== undefined && options.output.length > 0) {
    await atomicWrite(options.output, content);
  } else {
    ctx.stdout(content.replace(/\n$/, ''));
  }
  ctx.exit(EX_OK);
}
