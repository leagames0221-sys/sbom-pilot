/**
 * Unit tests for the CycloneDX 1.5 emitter (T-17).
 *
 * Three IR fixtures (minimal / single-component / multi-component with
 * relationships) are projected to CycloneDX 1.5 and asserted against:
 *   1. Vendored CycloneDX 1.5 schema (AC-001-6 — emit MUST pass)
 *   2. Determinism (re-emit yields byte-identical bytes)
 *   3. Structural invariants (one components[] entry per non-root IR
 *      component, root in metadata.component, dependencies grouped by ref)
 *
 * Spec mapping: AC-001-2, AC-001-6, AC-001-7, AC-001-8, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { emitCycloneDx } from '../../../src/emitters/cyclonedx-1.5.js';
import { serializeDocument } from '../../../src/emitters/_shared.js';
import { validate } from '../../../src/schemas/validate.js';
import type { SbomIR } from '../../../src/ir/index.js';

const baseDocument = {
  namespace: 'urn:sbom-pilot:cyclonedx-1.5:0000000000000000',
  createdAt: '2026-05-20T00:00:00Z',
  creator: 'sbom-pilot' as const,
  creatorVersion: '0.1.0',
  rootComponent: 'root',
};

const irMinimal: SbomIR = {
  document: baseDocument,
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

const irSingle: SbomIR = {
  document: baseDocument,
  components: [
    {
      id: 'root',
      purl: 'pkg:npm/host@1.0.0',
      name: 'host',
      version: '1.0.0',
      ecosystem: 'npm',
      license: { spdxId: 'MIT' },
    },
    {
      id: 'node_modules/lodash',
      purl: 'pkg:npm/lodash@4.17.21',
      name: 'lodash',
      version: '4.17.21',
      ecosystem: 'npm',
      license: { spdxId: 'MIT' },
    },
  ],
  relationships: [
    { from: 'root', to: 'node_modules/lodash', type: 'depends-on' },
  ],
};

const irMulti: SbomIR = {
  document: baseDocument,
  components: [
    {
      id: 'root',
      purl: 'pkg:npm/host-app@2.5.1',
      name: 'host-app',
      version: '2.5.1',
      supplier: 'Example Corp',
      license: { spdxId: 'Apache-2.0' },
      ecosystem: 'npm',
    },
    {
      id: 'node_modules/@scope/example',
      purl: 'pkg:npm/%40scope/example@1.0.0',
      name: '@scope/example',
      version: '1.0.0',
      ecosystem: 'npm',
      license: { expression: 'MIT OR Apache-2.0' },
      hash: {
        algorithm: 'SHA-256',
        value: 'a'.repeat(64),
      },
    },
    {
      id: 'node_modules/typescript',
      purl: 'pkg:npm/typescript@5.7.2',
      name: 'typescript',
      version: '5.7.2',
      ecosystem: 'npm',
    },
  ],
  relationships: [
    {
      from: 'root',
      to: 'node_modules/@scope/example',
      type: 'depends-on',
    },
    {
      from: 'root',
      to: 'node_modules/typescript',
      type: 'dev-depends-on',
    },
  ],
};

const fixtures: ReadonlyArray<{ name: string; ir: SbomIR }> = [
  { name: 'minimal', ir: irMinimal },
  { name: 'single', ir: irSingle },
  { name: 'multi', ir: irMulti },
];

describe('emitCycloneDx — schema conformance (AC-001-6)', () => {
  for (const { name, ir } of fixtures) {
    it(`fixture "${name}" validates against the vendored CycloneDX 1.5 schema`, () => {
      const doc = emitCycloneDx(ir);
      const result = validate('cyclonedx-1.5', doc);
      expect.soft(result.errors, 'unexpected schema errors').toBeNull();
      expect(result.ok).toBe(true);
    });
  }
});

describe('emitCycloneDx — document structure', () => {
  it('sets CycloneDX boilerplate (bomFormat / specVersion / version)', () => {
    const doc = emitCycloneDx(irMinimal);
    expect(doc['bomFormat']).toBe('CycloneDX');
    expect(doc['specVersion']).toBe('1.5');
    expect(doc['version']).toBe(1);
  });

  it('derives serialNumber from IR namespace in the strict UUID URN form', () => {
    const doc = emitCycloneDx(irMinimal);
    expect(doc['serialNumber']).toMatch(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('passes through an IR namespace that is already a UUID URN', () => {
    const fixedUuid = 'urn:uuid:11111111-2222-3333-4444-555555555555';
    const ir: SbomIR = {
      ...irMinimal,
      document: { ...baseDocument, namespace: fixedUuid },
    };
    const doc = emitCycloneDx(ir);
    expect(doc['serialNumber']).toBe(fixedUuid);
  });

  it('exposes timestamp + tools + component in metadata', () => {
    const doc = emitCycloneDx(irSingle);
    const meta = doc['metadata'] as {
      timestamp: string;
      tools: { components: Array<{ name: string; version: string; type: string }> };
      component: { name: string };
    };
    expect(meta.timestamp).toBe(baseDocument.createdAt);
    expect(meta.tools.components).toEqual([
      { type: 'application', name: 'sbom-pilot', version: '0.1.0' },
    ]);
    expect(meta.component.name).toBe('host');
  });
});

describe('emitCycloneDx — components projection', () => {
  it('omits the components array when only the root is present', () => {
    const doc = emitCycloneDx(irMinimal);
    expect(doc['components']).toBeUndefined();
  });

  it('emits one components[] entry per non-root IR component', () => {
    const doc = emitCycloneDx(irMulti);
    const components = doc['components'] as Array<Record<string, unknown>>;
    expect(components).toHaveLength(2);
    expect(components.map((c) => c['name'])).toEqual([
      '@scope/example',
      'typescript',
    ]);
  });

  it('passes through bom-ref verbatim (no SPDXID-style sanitisation)', () => {
    const doc = emitCycloneDx(irMulti);
    const components = doc['components'] as Array<{ 'bom-ref': string }>;
    expect(components.map((c) => c['bom-ref'])).toEqual([
      'node_modules/@scope/example',
      'node_modules/typescript',
    ]);
  });

  it('maps spdxId licenses to license.id', () => {
    const doc = emitCycloneDx(irSingle);
    const components = doc['components'] as Array<{
      licenses: Array<{ license: { id: string } }>;
    }>;
    expect(components[0]?.licenses).toEqual([{ license: { id: 'MIT' } }]);
  });

  it('maps license expressions to top-level expression entries', () => {
    const doc = emitCycloneDx(irMulti);
    const scoped = (
      doc['components'] as Array<{
        name: string;
        licenses?: Array<{ expression?: string }>;
      }>
    ).find((c) => c.name === '@scope/example');
    expect(scoped?.licenses).toEqual([{ expression: 'MIT OR Apache-2.0' }]);
  });

  it('omits licenses field entirely when IR component has no license', () => {
    const doc = emitCycloneDx(irMulti);
    const ts = (
      doc['components'] as Array<{ name: string; licenses?: unknown }>
    ).find((c) => c.name === 'typescript');
    expect(ts?.licenses).toBeUndefined();
  });

  it('preserves hash algorithm in hyphenated form (SHA-256, not SHA256)', () => {
    const doc = emitCycloneDx(irMulti);
    const scoped = (
      doc['components'] as Array<{
        name: string;
        hashes?: Array<{ alg: string; content: string }>;
      }>
    ).find((c) => c.name === '@scope/example');
    expect(scoped?.hashes?.[0]?.alg).toBe('SHA-256');
    expect(scoped?.hashes?.[0]?.content).toBe('a'.repeat(64));
  });

  it('uses ecosystem "library" for non-root components', () => {
    const doc = emitCycloneDx(irMulti);
    const components = doc['components'] as Array<{ type: string }>;
    for (const c of components) {
      expect(c.type).toBe('library');
    }
  });

  it('uses ecosystem "application" for the root metadata.component', () => {
    const doc = emitCycloneDx(irMulti);
    const meta = doc['metadata'] as { component: { type: string } };
    expect(meta.component.type).toBe('application');
  });

  it('emits supplier.name for components with supplier on the IR', () => {
    const doc = emitCycloneDx(irMulti);
    const meta = doc['metadata'] as {
      component: { supplier?: { name: string } };
    };
    expect(meta.component.supplier?.name).toBe('Example Corp');
  });
});

describe('emitCycloneDx — dependencies projection', () => {
  it('omits the dependencies array when there are no IR relationships', () => {
    const doc = emitCycloneDx(irMinimal);
    expect(doc['dependencies']).toBeUndefined();
  });

  it('groups relationships by source ref', () => {
    const doc = emitCycloneDx(irMulti);
    const deps = doc['dependencies'] as Array<{
      ref: string;
      dependsOn: string[];
    }>;
    expect(deps).toHaveLength(1);
    expect(deps[0]).toEqual({
      ref: 'root',
      dependsOn: ['node_modules/@scope/example', 'node_modules/typescript'],
    });
  });
});

describe('emitCycloneDx — determinism (AC-001-8)', () => {
  for (const { name, ir } of fixtures) {
    it(`fixture "${name}" serialises identically on repeat calls`, () => {
      const a = serializeDocument(emitCycloneDx(ir));
      const b = serializeDocument(emitCycloneDx(ir));
      expect(a).toBe(b);
    });
  }
});
