/**
 * Shared helpers for the SBOM emitters (SPDX 2.3, CycloneDX 1.5, SARIF
 * 2.1.0 results). Per ADR-0006 §Decision, this module sits at Layer 4
 * (Emitters) and consumes only the IR (Layer 2) and the cross-cutting
 * `src/util/` leaf. It does not reach into scanners, parsers, or CLI.
 *
 * Three concerns live here:
 *
 *   1. Deterministic namespace synthesis
 *        AC-001-8 — same project path + same git HEAD → same URN. Used by
 *        the CLI layer (or the parsers' option override) to pin the
 *        `document.namespace` on the IR before emission.
 *
 *   2. Citation footer formatting
 *        AC-003-5 — produce a stable creator / tool identification line
 *        embedded in SPDX `creationInfo.creators[]` and CycloneDX
 *        `metadata.tools.components[]`. Compliance reports (T-22+) will
 *        extend this with regulation snippet citations.
 *
 *   3. Atomic emission
 *        AC-001-3 / AC-002-7 — per ADR-0006 emitters are pure
 *        `(ir) => string` functions; the actual on-disk write is delegated
 *        to `atomicWrite` from `src/util/atomic-write.ts`. This file
 *        provides a thin wrapper (`emitToFile`) that joins the produce
 *        step with the atomic write so callers don't need to wire both
 *        helpers themselves.
 *
 * Spec mapping: AC-001-3, AC-001-8, AC-002-7, AC-003-5, ADR-0005, ADR-0006.
 */
import { createHash } from 'node:crypto';
import { atomicWrite } from '../util/atomic-write.js';

/**
 * Supported SBOM document formats for the namespace + citation helpers.
 * Mirrors the {@link import('../schemas/index.js').SchemaFormat} union but
 * scoped to the formats this module knows how to identify.
 */
export type EmitterFormat = 'spdx-2.3' | 'cyclonedx-1.5';

/**
 * Produce a stable URN for an SBOM document derived from the project
 * location and (optionally) the git HEAD. Same inputs → same URN, byte
 * for byte (AC-001-8).
 *
 * The URN shape is `urn:sbom-pilot:<format>:<sha256-prefix-16hex>` — the
 * 16-character prefix has ~64 bits of entropy which is more than enough
 * to be unique within any one user's project corpus while keeping the URN
 * short enough to fit in SPDX `documentNamespace` and CycloneDX
 * `serialNumber` fields without truncation.
 *
 * When `gitHead` is absent (working tree, no git repo, or an unborn HEAD)
 * the literal string `no-git` is folded into the hash so the URN is still
 * deterministic for the project path alone.
 */
export function computeDeterministicNamespace(
  projectPath: string,
  gitHead: string | null,
  format: EmitterFormat,
): string {
  const input = `${projectPath}|${gitHead ?? 'no-git'}|${format}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 16);
  return `urn:sbom-pilot:${format}:${hash}`;
}

/**
 * Format the citation / creator line that identifies this tool inside
 * the emitted SBOM. The shape is the SPDX-recommended `Tool: <name>-<version>`
 * convention; CycloneDX consumes the same string under
 * `metadata.tools.components[].name` + `.version`.
 *
 * The leading `Tool:` prefix is the literal SPDX creator-type tag — do
 * not strip it for CycloneDX use; instead split on the first `: ` and
 * map both halves into the structured tools entry.
 */
export function formatCitationFooter(creatorVersion: string): string {
  return `Tool: sbom-pilot-${creatorVersion}`;
}

/**
 * Stable JSON-serialise an emitted document. Keys are sorted at every
 * object level so re-emitting the same IR yields byte-identical output
 * (a precondition for the golden-snapshot tests in T-16 / T-17 and for
 * downstream signing pipelines that hash the SBOM bytes).
 *
 * `indent` defaults to 2 to match the spec's wire convention and to keep
 * diffs reviewable; callers that need compact output (e.g. streaming)
 * can pass `0` for newline-only or `undefined` for no whitespace at all.
 */
export function serializeDocument(
  doc: unknown,
  indent: number | undefined = 2,
): string {
  const sorted = sortObjectKeysDeep(doc);
  return JSON.stringify(sorted, null, indent) + '\n';
}

/**
 * Recursively rebuild an object with its own enumerable keys sorted in
 * lexical order. Arrays are preserved in their existing order (arrays
 * carry positional semantics in SPDX / CycloneDX). Primitives and `null`
 * pass through unchanged.
 *
 * Exported separately from {@link serializeDocument} so emitter unit
 * tests can assert sort behaviour without round-tripping through JSON.
 */
export function sortObjectKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    out[k] = sortObjectKeysDeep(v);
  }
  return out;
}

/**
 * Emit a serialised document to a path atomically. Thin sugar over
 * {@link serializeDocument} + `atomicWrite` so callers don't wire both.
 * Returns the serialised string for the caller's records (e.g.
 * stdout-printing or in-memory schema validation).
 */
export async function emitToFile(
  doc: unknown,
  outputPath: string,
  options: { indent?: number } = {},
): Promise<string> {
  const content = serializeDocument(doc, options.indent ?? 2);
  await atomicWrite(outputPath, content);
  return content;
}
