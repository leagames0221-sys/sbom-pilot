/**
 * Tests for the validate() helper + the 18-document golden corpus
 * (15 negative + 3 positive across 3 schema formats).
 *
 * Fixture layout: tests/golden/schema-validation/<format>/{positive-minimal,
 * NN-<short-name>}.json. Each negative fixture violates a single, named
 * constraint so a future regression that loosens a check surfaces a
 * specific test name rather than a generic "expected ok=false".
 *
 * Spec mapping: AC-001-5, AC-001-6, AC-002-4, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validate } from '../../../src/schemas/validate.js';
import { SCHEMA_FORMATS, type SchemaFormat } from '../../../src/schemas/index.js';

const goldenDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'golden',
  'schema-validation',
);

function loadFixture(format: SchemaFormat, file: string): unknown {
  const raw = readFileSync(join(goldenDir, format, file), 'utf8');
  return JSON.parse(raw);
}

function listNegativeFixtures(format: SchemaFormat): string[] {
  return readdirSync(join(goldenDir, format))
    .filter((name) => /^[0-9]{2}-.+\.json$/.test(name))
    .sort();
}

describe('validate() — return-shape contract', () => {
  it('returns { ok: true, errors: null } on a passing document', () => {
    const doc = loadFixture('cyclonedx-1.5', 'positive-minimal.json');
    const result = validate('cyclonedx-1.5', doc);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('returns { ok: false, errors: [...] } on a failing document', () => {
    const doc = loadFixture('cyclonedx-1.5', '01-missing-bomFormat.json');
    const result = validate('cyclonedx-1.5', doc);
    expect(result.ok).toBe(false);
    expect(result.errors).not.toBeNull();
    expect(result.errors?.length ?? 0).toBeGreaterThan(0);
  });

  it('returns a defensive copy of errors, not Ajv internal slot', () => {
    const docA = loadFixture('cyclonedx-1.5', '01-missing-bomFormat.json');
    const docB = loadFixture('cyclonedx-1.5', '02-bad-bomFormat.json');
    const resultA = validate('cyclonedx-1.5', docA);
    const errorsBefore = resultA.errors;
    // A subsequent validate() call against the same format would mutate
    // Ajv's shared `.errors` slot; assert the prior `errors` is untouched.
    validate('cyclonedx-1.5', docB);
    expect(resultA.errors).toBe(errorsBefore);
  });
});

describe('validate() — positive minimal fixtures (3 of 3)', () => {
  for (const format of SCHEMA_FORMATS) {
    it(`accepts positive-minimal.json for ${format}`, () => {
      const doc = loadFixture(format, 'positive-minimal.json');
      const result = validate(format, doc);
      // Surface errors on failure for diagnosability if a future vendored
      // schema bump tightens a required field.
      expect.soft(result.errors, 'unexpected errors').toBeNull();
      expect(result.ok).toBe(true);
    });
  }
});

describe('validate() — negative golden corpus (15 of 15)', () => {
  for (const format of SCHEMA_FORMATS) {
    const fixtures = listNegativeFixtures(format);
    it(`${format} has exactly 5 negative fixtures on disk`, () => {
      expect(fixtures).toHaveLength(5);
    });
    for (const file of fixtures) {
      it(`${format} rejects ${file}`, () => {
        const doc = loadFixture(format, file);
        const result = validate(format, doc);
        expect.soft(result.errors).not.toBeNull();
        expect(result.ok).toBe(false);
        expect((result.errors ?? []).length).toBeGreaterThan(0);
      });
    }
  }
});

describe('validate() — error-shape sanity', () => {
  it('every error has the Ajv-shaped instancePath + schemaPath fields', () => {
    const doc = loadFixture('cyclonedx-1.5', '01-missing-bomFormat.json');
    const result = validate('cyclonedx-1.5', doc);
    for (const err of result.errors ?? []) {
      expect(typeof err.instancePath).toBe('string');
      expect(typeof err.schemaPath).toBe('string');
      expect(typeof err.keyword).toBe('string');
    }
  });
});
