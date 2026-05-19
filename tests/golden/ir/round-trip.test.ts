/**
 * IR round-trip golden test.
 *
 * For 3 representative IR fixtures (minimal / single-component / multi-component
 * with optional fields + multiple relationship types), assert:
 *   IR → JSON.stringify → JSON.parse → zod validate → deep equality with original
 *
 * Reversibility under JSON serialization is a load-bearing property of the IR:
 * the parser → emitter handoff serializes IR over disk / IPC in some future
 * paths, and the round-trip test is the canary on `undefined` leaking into
 * `null`, `Date` sneaking in (non-JSON-safe), or zod schema drifting from
 * the hand-written type.
 *
 * Spec mapping: ADR-0005 §Reversibility, ADR-0005 §Decision.
 */
import { describe, expect, it } from 'vitest';
import { SbomIRSchema, type SbomIR } from '../../../src/ir/index.js';

const fixtureMinimal: SbomIR = {
  document: {
    namespace: 'urn:sbom-pilot:fixture-minimal',
    createdAt: '2026-05-19T00:00:00Z',
    creator: 'sbom-pilot',
    creatorVersion: '0.1.0',
    rootComponent: 'root',
  },
  components: [],
  relationships: [],
};

const fixtureSingle: SbomIR = {
  document: {
    namespace: 'urn:sbom-pilot:fixture-single',
    createdAt: '2026-05-19T00:00:00Z',
    creator: 'sbom-pilot',
    creatorVersion: '0.1.0',
    rootComponent: 'root',
  },
  components: [
    {
      id: 'root',
      purl: 'pkg:npm/example@1.0.0',
      name: 'example',
      version: '1.0.0',
      ecosystem: 'npm',
    },
  ],
  relationships: [],
};

const fixtureFull: SbomIR = {
  document: {
    namespace: 'urn:sbom-pilot:fixture-full',
    createdAt: '2026-05-19T00:00:00Z',
    creator: 'sbom-pilot',
    creatorVersion: '0.1.0',
    rootComponent: 'root',
  },
  components: [
    {
      id: 'root',
      purl: 'pkg:npm/host-app@2.5.1',
      name: 'host-app',
      version: '2.5.1',
      supplier: 'Example Corp',
      license: { spdxId: 'Apache-2.0' },
      hash: {
        algorithm: 'SHA-256',
        value:
          'a'.repeat(64),
      },
      ecosystem: 'npm',
    },
    {
      id: 'dep-prod',
      purl: 'pkg:npm/lodash@4.17.21',
      name: 'lodash',
      version: '4.17.21',
      license: { spdxId: 'MIT' },
      ecosystem: 'npm',
    },
    {
      id: 'dep-dev',
      purl: 'pkg:npm/vitest@2.1.9',
      name: 'vitest',
      version: '2.1.9',
      ecosystem: 'npm',
    },
    {
      id: 'dep-opt',
      purl: 'pkg:pypi/optional-extra@0.3.0',
      name: 'optional-extra',
      version: '0.3.0',
      license: { expression: 'MIT OR Apache-2.0' },
      ecosystem: 'PyPI',
    },
  ],
  relationships: [
    { from: 'root', to: 'dep-prod', type: 'depends-on' },
    { from: 'root', to: 'dep-dev', type: 'dev-depends-on' },
    { from: 'root', to: 'dep-opt', type: 'optional-depends-on' },
  ],
};

const fixtures: ReadonlyArray<{ name: string; ir: SbomIR }> = [
  { name: 'minimal', ir: fixtureMinimal },
  { name: 'single', ir: fixtureSingle },
  { name: 'full', ir: fixtureFull },
];

describe('IR round-trip (JSON.stringify → JSON.parse → zod validate)', () => {
  for (const { name, ir } of fixtures) {
    it(`fixture "${name}" round-trips losslessly`, () => {
      const wire = JSON.stringify(ir);
      const decoded: unknown = JSON.parse(wire);
      const validated = SbomIRSchema.parse(decoded);
      expect(validated).toEqual(ir);
    });

    it(`fixture "${name}" produces stable JSON for the same input twice`, () => {
      const a = JSON.stringify(ir);
      const b = JSON.stringify(ir);
      expect(a).toBe(b);
    });
  }

  it('JSON wire form contains no "undefined" tokens', () => {
    for (const { ir } of fixtures) {
      const wire = JSON.stringify(ir);
      expect(wire).not.toMatch(/:\s*undefined\b/);
    }
  });

  it('schema validation rejects a wire payload that has been corrupted in transit', () => {
    const wire = JSON.stringify(fixtureFull);
    const corrupted: unknown = JSON.parse(
      wire.replace('"depends-on"', '"contains"'),
    );
    const r = SbomIRSchema.safeParse(corrupted);
    expect(r.success).toBe(false);
  });
});
