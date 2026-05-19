/**
 * SPDX 2.3 emitter — pure `(ir) => SpdxDocument` projection of the IR.
 *
 * Reads the IR (Layer 2) and projects it onto an SPDX 2.3 JSON document
 * that validates against the vendored schema in `src/schemas/spdx-2.3.json`.
 * The emitter is a pure function: same IR + same options → byte-identical
 * output (precondition for the golden-snapshot tests and for any
 * downstream signing pipeline).
 *
 * Per ADR-0006 §Decision: Layer 4. Reads only the IR + the cross-cutting
 * src/emitters/_shared.ts helpers + the vendored schema for validation.
 * No imports from scanners, parsers, or CLI.
 *
 * Mapping notes:
 *
 *   IR.document       → SPDX top-level `spdxVersion` / `dataLicense` /
 *                        `SPDXID` / `name` / `documentNamespace` /
 *                        `creationInfo`
 *
 *   IR.components[]   → SPDX `packages[]`
 *     `id`            → `SPDXID` (sanitised — SPDXID pattern
 *                        `^SPDXRef-[A-Za-z0-9.\-]+$` requires `/`, `@`,
 *                        `:`, `_` etc. to be replaced; we canonicalise to
 *                        a single `-` per non-conforming run)
 *     `name`          → `name`
 *     `version`       → `versionInfo`
 *     `supplier`      → `supplier` ("Organization: <value>" if present,
 *                        else `NOASSERTION`)
 *     `license.*`     → `licenseConcluded` / `licenseDeclared`
 *                        - expression → use verbatim
 *                        - spdxId → use verbatim
 *                        - name (no spdxId/expression) → "LicenseRef-…"
 *                          custom reference, sanitised
 *                        - absent → "NOASSERTION"
 *     `hash`          → `checksums[]` (single-entry; SPDX uses unhyphenated
 *                        algorithm names: `SHA256`, `SHA512`)
 *     `purl`          → `externalRefs[]` with category=PACKAGE-MANAGER,
 *                        type=purl
 *
 *   IR.relationships[] + the implicit document-root edge
 *                     → SPDX `relationships[]`
 *     - One DESCRIBES edge from SPDXRef-DOCUMENT to the IR root component
 *     - One DEPENDS_ON edge per IR relationship. The IR's three relationship
 *       types (depends-on / dev-depends-on / optional-depends-on) all
 *       collapse to SPDX `DEPENDS_ON` at T-16 scope — a future enrichment
 *       can split into `DEV_DEPENDENCY_OF` / `OPTIONAL_DEPENDENCY_OF`
 *       (note the reversed `spdxElementId`/`relatedSpdxElement` semantics
 *       SPDX uses for those tags).
 *
 * Spec mapping: AC-001-1, AC-001-5, AC-001-7, AC-001-8, ADR-0005, ADR-0006.
 */
import type { Component, SbomIR } from '../ir/index.js';
import { formatCitationFooter } from './_shared.js';

const SPDX_VERSION = 'SPDX-2.3';
const SPDX_DATA_LICENSE = 'CC0-1.0';
const SPDX_DOCUMENT_ID = 'SPDXRef-DOCUMENT';

/**
 * SPDXID must match `^SPDXRef-[A-Za-z0-9.\-]+$`. Sanitise an arbitrary IR
 * id (which may contain `/`, `@`, `:`, `_`, etc.) by replacing runs of
 * non-conforming characters with a single `-`, then trimming any leading
 * or trailing `-`. The leading `SPDXRef-` prefix is added unconditionally.
 *
 * @example
 *   sanitizeSPDXID('root')                   → 'SPDXRef-root'
 *   sanitizeSPDXID('node_modules/lodash')    → 'SPDXRef-node-modules-lodash'
 *   sanitizeSPDXID('@scope/example@1.0.0')   → 'SPDXRef-scope-example-1.0.0'
 *   sanitizeSPDXID('pypi:foo@1.0.0')         → 'SPDXRef-pypi-foo-1.0.0'
 */
export function sanitizeSPDXID(rawId: string): string {
  const stripped = rawId
    .replace(/[^A-Za-z0-9.\-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return `SPDXRef-${stripped.length > 0 ? stripped : 'unnamed'}`;
}

/**
 * Convert IR ComponentHash algorithm to SPDX's unhyphenated form.
 * IR uses `SHA-256` / `SHA-512`; SPDX uses `SHA256` / `SHA512`.
 */
function spdxAlgorithm(algorithm: 'SHA-256' | 'SHA-512'): 'SHA256' | 'SHA512' {
  return algorithm === 'SHA-256' ? 'SHA256' : 'SHA512';
}

/**
 * Map IR `LicenseExpression` to the SPDX licenseConcluded string. Absent
 * licenses fall through to `NOASSERTION`. A `name`-only license becomes
 * a `LicenseRef-` custom reference with the same sanitisation rules as
 * {@link sanitizeSPDXID} minus the SPDXRef- prefix.
 */
function licenseToSpdxField(component: Component): string {
  const lic = component.license;
  if (lic === undefined) return 'NOASSERTION';
  if (lic.expression !== undefined && lic.expression.length > 0) {
    return lic.expression;
  }
  if (lic.spdxId !== undefined && lic.spdxId.length > 0) {
    return lic.spdxId;
  }
  if (lic.name !== undefined && lic.name.length > 0) {
    const sanitised = lic.name
      .replace(/[^A-Za-z0-9.\-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `LicenseRef-${sanitised.length > 0 ? sanitised : 'unknown'}`;
  }
  return 'NOASSERTION';
}

/**
 * Build the SPDX `packages[]` entry for a single IR Component.
 */
function buildSpdxPackage(component: Component): Record<string, unknown> {
  const pkg: Record<string, unknown> = {
    SPDXID: sanitizeSPDXID(component.id),
    name: component.name,
    versionInfo: component.version,
    downloadLocation: 'NOASSERTION',
    licenseConcluded: licenseToSpdxField(component),
    licenseDeclared: licenseToSpdxField(component),
    copyrightText: 'NOASSERTION',
    supplier:
      component.supplier !== undefined && component.supplier.length > 0
        ? `Organization: ${component.supplier}`
        : 'NOASSERTION',
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: component.purl,
      },
    ],
  };
  if (component.hash !== undefined) {
    pkg['checksums'] = [
      {
        algorithm: spdxAlgorithm(component.hash.algorithm),
        checksumValue: component.hash.value,
      },
    ];
  }
  return pkg;
}

/**
 * Emit an IR as an SPDX 2.3 JSON document object. The return value is the
 * fully-realised document (not yet serialised to a string); callers wrap
 * it with `serializeDocument` from src/emitters/_shared.ts when writing to
 * disk and with `validate('spdx-2.3', doc)` when gating the write on
 * schema conformance (AC-001-5).
 */
export function emitSpdx(ir: SbomIR): Record<string, unknown> {
  const documentName =
    ir.components.find((c) => c.id === ir.document.rootComponent)?.name ??
    'unnamed-project';

  const packages = ir.components.map(buildSpdxPackage);

  const relationships: Array<Record<string, unknown>> = [
    {
      spdxElementId: SPDX_DOCUMENT_ID,
      relatedSpdxElement: sanitizeSPDXID(ir.document.rootComponent),
      relationshipType: 'DESCRIBES',
    },
  ];
  for (const rel of ir.relationships) {
    relationships.push({
      spdxElementId: sanitizeSPDXID(rel.from),
      relatedSpdxElement: sanitizeSPDXID(rel.to),
      relationshipType: 'DEPENDS_ON',
    });
  }

  return {
    spdxVersion: SPDX_VERSION,
    dataLicense: SPDX_DATA_LICENSE,
    SPDXID: SPDX_DOCUMENT_ID,
    name: documentName,
    documentNamespace: ir.document.namespace,
    creationInfo: {
      created: ir.document.createdAt,
      creators: [formatCitationFooter(ir.document.creatorVersion)],
    },
    packages,
    relationships,
  };
}
