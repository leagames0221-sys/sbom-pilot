/**
 * CycloneDX 1.5 emitter — pure `(ir) => CycloneDxDocument` projection.
 *
 * Reads the IR (Layer 2) and projects it onto a CycloneDX 1.5 JSON
 * document that validates against the vendored schema in
 * `src/schemas/cyclonedx-1.5.json` (plus the two sibling schemas
 * `cyclonedx-spdx.schema.json` and `cyclonedx-jsf-0.82.schema.json`,
 * pre-registered by the schema loader). Same IR + same options →
 * byte-identical output when paired with `serializeDocument()` from
 * `_shared.ts`.
 *
 * Per ADR-0006 §Decision: Layer 4 reads only the IR (Layer 2) +
 * `src/emitters/_shared.ts`. No imports from scanners / parsers / CLI.
 *
 * Mapping notes (IR → CycloneDX 1.5):
 *
 *   IR.document          → top-level boilerplate (`bomFormat: "CycloneDX"`,
 *                           `specVersion: "1.5"`, `version: 1`),
 *                           `serialNumber` (pass-through of IR namespace),
 *                           `metadata.timestamp`, `metadata.tools`,
 *                           `metadata.component` (the root entry)
 *
 *   IR.components[]      → non-root components → `components[]` (one
 *                           entry per IR component, excluding the root —
 *                           root lives in `metadata.component`)
 *     `id`                → `bom-ref` (verbatim; CycloneDX is permissive
 *                            and accepts arbitrary strings for refs)
 *     `name`              → `name`
 *     `version`           → `version`
 *     `supplier`          → `supplier.name`
 *     `license.*`         → `licenses[]`:
 *                           - expression → `[ { expression: "<...>" } ]`
 *                           - spdxId → `[ { license: { id: "<...>" } } ]`
 *                           - name → `[ { license: { name: "<...>" } } ]`
 *                           - absent → field omitted
 *     `hash`              → `hashes[]` (algorithm preserved as-is —
 *                            CycloneDX uses the hyphenated forms that
 *                            match our IR: `SHA-256`, `SHA-512`)
 *     `purl`              → `purl`
 *     `ecosystem`         → `type` (library by default; root is `application`)
 *
 *   IR.relationships[]   → `dependencies[]`, grouped by `from` id. CycloneDX
 *                          represents the graph as one entry per source ref
 *                          with a `dependsOn[]` array. IR's three
 *                          relationship types (depends-on / dev-depends-on /
 *                          optional-depends-on) collapse to a single
 *                          `dependsOn[]` at T-17 scope — CycloneDX models
 *                          dev/optional via per-component `scope` rather
 *                          than per-edge, so the distinction is lost
 *                          structurally here (future enrichment to set
 *                          `component.scope = "optional"` when the only
 *                          incoming edge is dev/optional).
 *
 * Spec mapping: AC-001-2, AC-001-6, AC-001-7, AC-001-8, ADR-0005, ADR-0006.
 */
import { createHash } from 'node:crypto';
import type { Component, SbomIR } from '../ir/index.js';

const CYCLONEDX_BOM_FORMAT = 'CycloneDX';
const CYCLONEDX_SPEC_VERSION = '1.5';
const CYCLONEDX_DOCUMENT_VERSION = 1;
const TOOL_NAME = 'sbom-pilot';

interface CycloneDxLicenseEntry {
  license?: { id?: string; name?: string };
  expression?: string;
}

/**
 * Project an IR `LicenseExpression` to a CycloneDX `licenses[]` entry array.
 * Returns an empty array if the IR carries no license — emitter callers
 * then omit the `licenses` field entirely.
 */
const UUID_URN_PATTERN =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Project an IR document namespace onto the CycloneDX `serialNumber`
 * pattern. CycloneDX 1.5 §serialNumber requires the literal RFC-4122
 * URN-UUID form `urn:uuid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. The IR
 * namespace shape produced by `computeDeterministicNamespace()` does NOT
 * match (it embeds the format and tool tag), so we derive a deterministic
 * UUID-shaped URN by SHA-256-hashing the IR namespace and slicing the
 * 32 leading hex chars into the 8-4-4-4-12 layout.
 *
 * Pass-through when the IR namespace already matches the UUID URN
 * pattern (CLI / tests can pin a known UUID directly).
 *
 * The derived value is NOT a version-tagged UUID per RFC 4122 §4.1.1
 * (the version + variant bits are not forced); the CycloneDX schema's
 * regex only checks the hex+dash layout, which this satisfies.
 */
export function deriveCycloneDxSerialNumber(irNamespace: string): string {
  if (UUID_URN_PATTERN.test(irNamespace)) return irNamespace;
  const hash = createHash('sha256').update(irNamespace).digest('hex');
  return `urn:uuid:${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(
    12,
    16,
  )}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function licensesArray(component: Component): CycloneDxLicenseEntry[] {
  const lic = component.license;
  if (lic === undefined) return [];
  if (lic.expression !== undefined && lic.expression.length > 0) {
    return [{ expression: lic.expression }];
  }
  if (lic.spdxId !== undefined && lic.spdxId.length > 0) {
    return [{ license: { id: lic.spdxId } }];
  }
  if (lic.name !== undefined && lic.name.length > 0) {
    return [{ license: { name: lic.name } }];
  }
  return [];
}

/**
 * Build a single CycloneDX `components[]` entry from an IR Component.
 * Used both for the non-root components array and (with `type = application`)
 * for the metadata.component root entry.
 */
function buildCycloneDxComponent(
  component: Component,
  type: 'library' | 'application',
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'bom-ref': component.id,
    type,
    name: component.name,
    version: component.version,
    purl: component.purl,
  };
  if (component.supplier !== undefined && component.supplier.length > 0) {
    out['supplier'] = { name: component.supplier };
  }
  const licenses = licensesArray(component);
  if (licenses.length > 0) {
    out['licenses'] = licenses;
  }
  if (component.hash !== undefined) {
    out['hashes'] = [
      {
        alg: component.hash.algorithm,
        content: component.hash.value,
      },
    ];
  }
  return out;
}

/**
 * Group IR relationships by `from`-ref into the CycloneDX `dependencies[]`
 * shape `{ ref, dependsOn: [...] }`. Sources are sorted lexically so the
 * output is deterministic; `dependsOn[]` lists preserve the IR's encounter
 * order (parser emits them deterministically from the manifest already).
 */
function buildDependencies(
  ir: SbomIR,
): Array<{ ref: string; dependsOn: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const rel of ir.relationships) {
    const existing = grouped.get(rel.from) ?? [];
    existing.push(rel.to);
    grouped.set(rel.from, existing);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([ref, dependsOn]) => ({ ref, dependsOn }));
}

/**
 * Emit an IR as a CycloneDX 1.5 JSON document object. The return value is
 * the fully-realised document (not yet serialised to a string); callers
 * wrap it with `serializeDocument` from src/emitters/_shared.ts when
 * writing to disk and with `validate('cyclonedx-1.5', doc)` when gating
 * the write on schema conformance (AC-001-6).
 */
export function emitCycloneDx(ir: SbomIR): Record<string, unknown> {
  const rootComponent =
    ir.components.find((c) => c.id === ir.document.rootComponent) ?? null;
  const nonRootComponents = ir.components.filter(
    (c) => c.id !== ir.document.rootComponent,
  );

  const metadata: Record<string, unknown> = {
    timestamp: ir.document.createdAt,
    tools: {
      components: [
        {
          type: 'application',
          name: TOOL_NAME,
          version: ir.document.creatorVersion,
        },
      ],
    },
  };
  if (rootComponent !== null) {
    metadata['component'] = buildCycloneDxComponent(
      rootComponent,
      'application',
    );
  }

  const doc: Record<string, unknown> = {
    bomFormat: CYCLONEDX_BOM_FORMAT,
    specVersion: CYCLONEDX_SPEC_VERSION,
    version: CYCLONEDX_DOCUMENT_VERSION,
    serialNumber: deriveCycloneDxSerialNumber(ir.document.namespace),
    metadata,
  };

  if (nonRootComponents.length > 0) {
    doc['components'] = nonRootComponents.map((c) =>
      buildCycloneDxComponent(c, 'library'),
    );
  }
  const dependencies = buildDependencies(ir);
  if (dependencies.length > 0) {
    doc['dependencies'] = dependencies;
  }

  return doc;
}
