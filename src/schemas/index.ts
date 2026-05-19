/**
 * Vendored JSON-Schema loader + Ajv compilation cache.
 *
 * Three schemas are vendored under this directory (committed verbatim from
 * the upstream canonical sources at the dates listed below). At runtime
 * they are loaded via `fs.readFileSync` and compiled lazily into Ajv
 * validators on first use, then cached for the life of the process.
 *
 *   - spdx-2.3.json       — SPDX 2.3 SBOM document schema
 *       source: https://github.com/spdx/spdx-spec @ tag `v2.3`
 *               schemas/spdx-schema.json
 *       fetched: 2026-05-20
 *
 *   - cyclonedx-1.5.json  — CycloneDX 1.5 BOM document schema
 *       source: https://github.com/CycloneDX/specification @ master
 *               schema/bom-1.5.schema.json
 *       fetched: 2026-05-20
 *       sibling $refs (pre-registered with the CycloneDX Ajv instance):
 *         - cyclonedx-spdx.schema.json
 *             (referenced as `spdx.schema.json` — CycloneDX's vendored
 *              SPDX license-expression sub-schema, separate from the
 *              full SPDX 2.3 document schema above)
 *         - cyclonedx-jsf-0.82.schema.json
 *             (referenced as `jsf-0.82.schema.json` — JSON Signature
 *              Format used by CycloneDX's optional signature block)
 *
 *   - sarif-2.1.0.json    — SARIF 2.1.0 static-analysis result schema
 *       source: https://json.schemastore.org/sarif-2.1.0.json
 *       fetched: 2026-05-20
 *
 * Per ADR-0006 module boundary: this is a leaf cross-cutting module (not
 * a layer). Importable by Layer 4 emitters (SPDX/CycloneDX/SARIF) and
 * Layer 5 CLI for output validation. No imports from scanners / parsers.
 *
 * Per ADR-0001 §Adoption shape: schemas are vendored at design time, not
 * fetched at runtime — offline-first by construction (AC-NF-offline).
 *
 * Spec mapping:
 *   - AC-001-5 (SPDX 2.3 schema validation before write)
 *   - AC-001-6 (CycloneDX 1.5 schema validation before write)
 *   - AC-002-4 (SARIF schema validation before write)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv, {
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv';
import addFormats from 'ajv-formats';

export type SchemaFormat = 'spdx-2.3' | 'cyclonedx-1.5' | 'sarif-2.1.0';

export const SCHEMA_FORMATS: ReadonlyArray<SchemaFormat> = [
  'spdx-2.3',
  'cyclonedx-1.5',
  'sarif-2.1.0',
];

const here = dirname(fileURLToPath(import.meta.url));

function readSchemaFile(format: SchemaFormat): AnySchema {
  const path = join(here, `${format}.json`);
  const raw = readFileSync(path, 'utf8');
  // Trust boundary: the vendored schemas under this directory are
  // committed verbatim from canonical upstream sources (see module
  // header for retrieval dates) and treated as Ajv-ready inputs.
  return JSON.parse(raw) as AnySchema;
}

/**
 * Per-format Ajv instances. One Ajv per vendored schema isolates the
 * `$id`-based schema registries from each other, so adding a new vendored
 * format never collides with an existing `$id` and so any future Ajv
 * configuration tweaks (custom keywords, meta-schema overrides) can be
 * scoped per-format without leaking. The memory overhead is bounded by
 * the number of vendored formats (currently three).
 *
 * Strict mode is disabled because the three vendored schemas predate
 * some of Ajv 8's strictness rules and would otherwise refuse to compile
 * (e.g. unknown formats / unused `$defs`). `allErrors: true` so
 * validation surfaces every issue, not just the first.
 *
 * `addFormats` registers the common JSON Schema formats (date-time, uri,
 * email, regex, uuid, ipv4, ipv6, etc.) that the vendored schemas
 * reference.
 */
function newConfiguredAjv(): Ajv {
  const instance = new Ajv({ allErrors: true, strict: false });
  addFormats(instance);
  return instance;
}

/**
 * Pre-register sibling schemas that a vendored format's `$ref`s point at
 * before compiling the primary schema. CycloneDX 1.5 is the only format
 * with external `$ref` resolution at T-13 scope; SPDX 2.3 and SARIF 2.1.0
 * have no external refs.
 */
function registerSiblingSchemas(instance: Ajv, format: SchemaFormat): void {
  if (format !== 'cyclonedx-1.5') return;
  const siblings = ['cyclonedx-spdx.schema.json', 'cyclonedx-jsf-0.82.schema.json'];
  for (const file of siblings) {
    const raw = readFileSync(join(here, file), 'utf8');
    instance.addSchema(JSON.parse(raw) as AnySchema);
  }
}

const validatorCache = new Map<SchemaFormat, ValidateFunction>();

/**
 * Return the compiled Ajv validator for one of the three vendored
 * schemas. Compiled validators are cached after first use; subsequent
 * calls return the same `ValidateFunction` reference.
 *
 * Throws if Ajv rejects the schema; for the vendored schemas this is a
 * programming / vendoring error rather than a runtime failure.
 */
export function getValidator(format: SchemaFormat): ValidateFunction {
  const cached = validatorCache.get(format);
  if (cached !== undefined) return cached;
  const schema = readSchemaFile(format);
  const instance = newConfiguredAjv();
  registerSiblingSchemas(instance, format);
  const compiled = instance.compile(schema);
  validatorCache.set(format, compiled);
  return compiled;
}

/**
 * Re-export Ajv's `ErrorObject` so consumers of the schema module can
 * type their error-handling without depending on Ajv directly.
 */
export type { ErrorObject };
