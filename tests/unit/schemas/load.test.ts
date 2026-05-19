/**
 * Tests for the vendored-schema loader (T-13).
 *
 * Asserts:
 *   - All three schema files load + compile without throwing
 *   - Each compiled validator accepts a minimal canonical reference
 *     document for its respective format
 *   - The validator cache returns the same instance across calls
 *
 * Spec mapping: AC-001-5, AC-001-6, AC-002-4.
 */
import { describe, expect, it } from 'vitest';
import {
  getValidator,
  SCHEMA_FORMATS,
  type SchemaFormat,
} from '../../../src/schemas/index.js';

/**
 * Minimal canonical reference documents per format. Kept inside the test
 * file so the upstream schema spec is the source of truth — the test
 * fixtures are derived literally from each spec's "minimum required
 * fields" wording.
 */
const minimalValidDocuments: Record<SchemaFormat, unknown> = {
  'spdx-2.3': {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'sbom-pilot-test',
    documentNamespace: 'https://example.com/spdx/test',
    creationInfo: {
      created: '2026-05-20T00:00:00Z',
      creators: ['Tool: sbom-pilot-0.1.0'],
    },
  },
  'cyclonedx-1.5': {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
  },
  'sarif-2.1.0': {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'sbom-pilot' } },
      },
    ],
  },
};

describe('schema loader — vendored schemas compile', () => {
  for (const format of SCHEMA_FORMATS) {
    it(`compiles ${format} without throwing`, () => {
      expect(() => getValidator(format)).not.toThrow();
    });
  }
});

describe('schema loader — minimal valid documents are accepted', () => {
  for (const format of SCHEMA_FORMATS) {
    it(`${format} validator accepts a minimal canonical document`, () => {
      const validator = getValidator(format);
      const doc = minimalValidDocuments[format];
      const ok = validator(doc);
      // Surface the actual errors on assertion failure for diagnosability
      // when a future vendored schema bump tightens a constraint.
      expect.soft(validator.errors ?? null, 'unexpected validation errors').toBeNull();
      expect(ok).toBe(true);
    });
  }
});

describe('schema loader — validator cache', () => {
  it('returns the same compiled validator instance across calls', () => {
    const first = getValidator('spdx-2.3');
    const second = getValidator('spdx-2.3');
    expect(first).toBe(second);
  });

  it('returns distinct instances per format', () => {
    const spdx = getValidator('spdx-2.3');
    const cyclonedx = getValidator('cyclonedx-1.5');
    const sarif = getValidator('sarif-2.1.0');
    expect(spdx).not.toBe(cyclonedx);
    expect(cyclonedx).not.toBe(sarif);
    expect(spdx).not.toBe(sarif);
  });
});

describe('schema loader — surface assertions', () => {
  it('exports exactly 3 schema formats', () => {
    expect(SCHEMA_FORMATS).toEqual([
      'spdx-2.3',
      'cyclonedx-1.5',
      'sarif-2.1.0',
    ]);
  });
});
