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
  EX_NOPERM,
  EX_OK,
  EX_SOFTWARE,
  EX_USAGE,
} from '../../exit-codes.js';
import { readPackageVersion } from '../version.js';
import {
  verifyAnchoreBinary,
  type CosignTarget,
  type CosignVerifyOptions,
} from '../../subprocess/cosign.js';

export type SbomFormat = 'spdx' | 'cyclonedx';

export interface SbomCommandOptions {
  format?: string;
  output?: string;
  // T-39 opt-in subprocess path (AC-NF-cosign-gate, ADR-0001).
  // When `useSyft` (or `useGrype`) is true, the corresponding
  // binary / signature / certificate triple MUST be provided so
  // cosign can verify the binary before any spawn would occur.
  useSyft?: boolean;
  useGrype?: boolean;
  syftBinary?: string;
  syftSignature?: string;
  syftCertificate?: string;
  grypeBinary?: string;
  grypeSignature?: string;
  grypeCertificate?: string;
  // Test injection: same shape as CosignVerifyOptions.spawn. Production
  // callers leave this undefined so the real `cosign` binary on PATH is
  // invoked.
  cosignSpawn?: CosignVerifyOptions['spawn'];
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
interface OptInBundle {
  target: CosignTarget;
  binary: string | undefined;
  signature: string | undefined;
  certificate: string | undefined;
}

function pickOptInBundle(options: SbomCommandOptions): OptInBundle | null {
  if (options.useSyft === true) {
    return {
      target: 'syft',
      binary: options.syftBinary,
      signature: options.syftSignature,
      certificate: options.syftCertificate,
    };
  }
  if (options.useGrype === true) {
    return {
      target: 'grype',
      binary: options.grypeBinary,
      signature: options.grypeSignature,
      certificate: options.grypeCertificate,
    };
  }
  return null;
}

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

  // T-39: AC-NF-cosign-gate. Verify the Anchore binary cosign signature
  // BEFORE any spawn could happen. On failure, refuse with EX_NOPERM and
  // never run a subprocess. On success, Phase α still uses the TS-native
  // emitter (subprocess parse-back is Phase β scope); we surface that
  // honestly on stderr so the user is not misled.
  const optIn = pickOptInBundle(options);
  if (optIn !== null) {
    if (
      optIn.binary === undefined ||
      optIn.signature === undefined ||
      optIn.certificate === undefined
    ) {
      ctx.stderr(
        `sbom-pilot sbom: --use-${optIn.target} requires --${optIn.target}-binary, --${optIn.target}-signature, --${optIn.target}-certificate.`,
      );
      ctx.exit(EX_USAGE);
      return;
    }
    const verifyResult = verifyAnchoreBinary(optIn.target, {
      binaryPath: optIn.binary,
      signaturePath: optIn.signature,
      certificatePath: optIn.certificate,
      ...(options.cosignSpawn !== undefined
        ? { spawn: options.cosignSpawn }
        : {}),
    });
    if (!verifyResult.ok) {
      ctx.stderr(`sbom-pilot sbom: ${verifyResult.message}`);
      ctx.exit(EX_NOPERM);
      return;
    }
    ctx.stderr(
      `sbom-pilot sbom: ${verifyResult.message} (Phase α: subprocess wrap is Phase β scope — falling back to the TypeScript-native ${format} emitter for this run.)`,
    );
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
