/**
 * Schema-validation helper.
 *
 * Thin functional wrapper over {@link getValidator} that returns a stable
 * `{ ok, errors }` shape — callers don't need to know about Ajv's
 * `validate(doc)` return-value-plus-side-effect contract or about how
 * `.errors` is reused across invocations of the same validator.
 *
 * Per ADR-0006 module boundary: leaf cross-cutting module. Importable by
 * Layer 4 emitters (pre-write validation) and Layer 5 CLI (post-emit
 * validation as the AC-001-5 / AC-001-6 / AC-002-4 gate).
 *
 * Spec mapping: AC-001-5, AC-001-6, AC-002-4, ADR-0005, ADR-0006.
 */
import {
  getValidator,
  type ErrorObject,
  type SchemaFormat,
} from './index.js';

export interface ValidationResult {
  /** True when the document satisfies the schema. */
  ok: boolean;
  /**
   * When `ok` is false, the list of validation errors as reported by Ajv.
   * When `ok` is true, `null` (no allocation for the happy path).
   *
   * The error array is a defensive copy of `validator.errors` so callers
   * are free to retain or mutate it without disturbing Ajv's internal
   * state on subsequent calls.
   */
  errors: ErrorObject[] | null;
}

/**
 * Validate `doc` against one of the three vendored schemas.
 *
 * @example
 *   const { ok, errors } = validate('spdx-2.3', someDocument);
 *   if (!ok) { console.error(errors); process.exit(EX_DATAERR); }
 */
export function validate(
  format: SchemaFormat,
  doc: unknown,
): ValidationResult {
  const validator = getValidator(format);
  const ok = validator(doc);
  if (ok) return { ok: true, errors: null };
  // Defensive copy: Ajv reuses the `.errors` slot across calls, so a
  // caller that keeps a reference to it would see it mutated by the
  // next `validate(...)` call against the same format.
  const errors = [...(validator.errors ?? [])];
  return { ok: false, errors };
}
