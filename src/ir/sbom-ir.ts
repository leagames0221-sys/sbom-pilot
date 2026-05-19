/**
 * Internal SBOM intermediate representation (IR).
 *
 * Populated once from a project's manifest by the parser layer; projected by
 * per-format emitters (SPDX 2.3, CycloneDX 1.5) and the compliance reporters.
 * The IR is the union of fields needed by both SBOM formats plus the extra
 * fields required by ADR-0003 compliance reports.
 *
 * Shape source: ADR-0005 §Decision.
 *
 * Spec mapping:
 *   - ADR-0005 (IR shape, dual-emitter rationale, YAGNI minimal field set)
 *   - AC-001-1 / AC-001-2 (SPDX 2.3 / CycloneDX 1.5 emission)
 *   - AC-001-5 / AC-001-6 (schema validation before write)
 *   - AC-001-7 (license expression)
 *   - AC-001-8 (deterministic namespace)
 */

/**
 * Local reference to a {@link Component} by its `id` field.
 * Used by `document.rootComponent` and by {@link Relationship} endpoints.
 */
export type ComponentRef = string;

/**
 * Supported package ecosystems. `'unknown'` is the fallback when the parser
 * cannot positively identify the ecosystem (e.g. a hand-rolled manifest).
 */
export type Ecosystem =
  | 'npm'
  | 'PyPI'
  | 'Go'
  | 'Maven'
  | 'crates.io'
  | 'unknown';

/**
 * Cryptographic hash of the component artifact, when the manifest provides it.
 *
 * Optional on {@link Component} because not every dependency manifest carries
 * hashes (e.g. unpinned `requirements.txt`). Synthesizing hashes would mislead
 * downstream auditors — leaving the field absent is honest.
 */
export interface ComponentHash {
  algorithm: 'SHA-256' | 'SHA-512';
  value: string;
}

/**
 * License of a {@link Component}.
 *
 * At most one of `spdxId` / `name` / `expression` is typically populated:
 *   - `spdxId` for canonical, resolvable SPDX License List entries
 *   - `expression` for compound SPDX expressions (`MIT OR Apache-2.0`)
 *   - `name` as a raw, unresolved fallback string
 *
 * All three fields are optional so parsers may emit a half-populated value
 * when the manifest is ambiguous.
 */
export interface LicenseExpression {
  spdxId?: string | undefined;
  name?: string | undefined;
  expression?: string | undefined;
}

/**
 * A single software component (package, module, library) discovered in the
 * project's dependency graph.
 *
 * `id` is a local identifier opaque to consumers; `purl` is the
 * cross-ecosystem canonical identifier (package-url spec).
 */
export interface Component {
  id: string;
  purl: string;
  name: string;
  version: string;
  supplier?: string | undefined;
  license?: LicenseExpression | undefined;
  hash?: ComponentHash | undefined;
  ecosystem: Ecosystem;
}

/**
 * Edge in the dependency graph, identifying a directed relationship between
 * two {@link Component}s by their `id`.
 *
 * The three relationship types map cleanly onto both SPDX `relationshipType`
 * (`DEPENDS_ON`, `DEV_DEPENDENCY_OF`, `OPTIONAL_DEPENDENCY_OF`) and
 * CycloneDX `dependencies[]` semantics.
 */
export interface Relationship {
  from: ComponentRef;
  to: ComponentRef;
  type: 'depends-on' | 'dev-depends-on' | 'optional-depends-on';
}

/**
 * Document-level metadata, populated once per SBOM emission.
 *
 * `namespace` is a deterministic URN derived from the project path + git HEAD
 * so that re-emitting the same project at the same revision yields the same
 * document namespace (AC-001-8). `createdAt` is the only non-deterministic
 * field; emitters that need full determinism can be passed a frozen clock.
 */
export interface SbomDocument {
  namespace: string;
  createdAt: string;
  creator: 'sbom-pilot';
  creatorVersion: string;
  rootComponent: ComponentRef;
}

/**
 * Top-level SBOM IR. Pure data: no methods, no class identity. Round-trips
 * losslessly through `JSON.stringify` / `JSON.parse` and zod validation
 * (see `tests/golden/ir/round-trip.test.ts`).
 */
export interface SbomIR {
  document: SbomDocument;
  components: Component[];
  relationships: Relationship[];
}
