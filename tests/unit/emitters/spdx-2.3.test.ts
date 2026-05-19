/**
 * Unit tests for the SPDX 2.3 emitter (T-16).
 *
 * Three IR fixtures (minimal / single-component / multi-component with
 * relationships) are projected to SPDX 2.3 and asserted against:
 *   1. Vendored SPDX schema (AC-001-5 — emit MUST pass the schema)
 *   2. Determinism (re-emit yields byte-identical bytes)
 *   3. Structural invariants (every IR component → one SPDX package,
 *      every IR relationship + one DESCRIBES edge → SPDX relationships)
 *
 * Spec mapping: AC-001-1, AC-001-5, AC-001-7, AC-001-8, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { emitSpdx, sanitizeSPDXID } from '../../../src/emitters/spdx-2.3.js';
import { serializeDocument } from '../../../src/emitters/_shared.js';
import { validate } from '../../../src/schemas/validate.js';
import type { SbomIR } from '../../../src/ir/index.js';

const baseDocument = {
  namespace: 'urn:sbom-pilot:spdx-2.3:0000000000000000',
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

describe('sanitizeSPDXID', () => {
  it('passes through alphanumeric ids', () => {
    expect(sanitizeSPDXID('root')).toBe('SPDXRef-root');
  });

  it('replaces slashes with hyphens', () => {
    expect(sanitizeSPDXID('node_modules/lodash')).toBe(
      'SPDXRef-node-modules-lodash',
    );
  });

  it('replaces scope/version @ signs with hyphens', () => {
    expect(sanitizeSPDXID('@scope/example@1.0.0')).toBe(
      'SPDXRef-scope-example-1.0.0',
    );
  });

  it('replaces colons with hyphens (pypi-style ids)', () => {
    expect(sanitizeSPDXID('pypi:foo@1.0.0')).toBe('SPDXRef-pypi-foo-1.0.0');
  });

  it('falls back to SPDXRef-unnamed when the input strips to empty', () => {
    expect(sanitizeSPDXID('@@@')).toBe('SPDXRef-unnamed');
  });
});

describe('emitSpdx — schema conformance (AC-001-5)', () => {
  for (const { name, ir } of fixtures) {
    it(`fixture "${name}" validates against the vendored SPDX 2.3 schema`, () => {
      const doc = emitSpdx(ir);
      const result = validate('spdx-2.3', doc);
      expect.soft(result.errors, 'unexpected schema errors').toBeNull();
      expect(result.ok).toBe(true);
    });
  }
});

describe('emitSpdx — document structure', () => {
  it('sets SPDX boilerplate (spdxVersion / dataLicense / SPDXID-DOCUMENT)', () => {
    const doc = emitSpdx(irMinimal);
    expect(doc['spdxVersion']).toBe('SPDX-2.3');
    expect(doc['dataLicense']).toBe('CC0-1.0');
    expect(doc['SPDXID']).toBe('SPDXRef-DOCUMENT');
  });

  it('pulls documentNamespace from IR.document.namespace', () => {
    const doc = emitSpdx(irMinimal);
    expect(doc['documentNamespace']).toBe(baseDocument.namespace);
  });

  it('uses the root component name as the document name', () => {
    const doc = emitSpdx(irSingle);
    expect(doc['name']).toBe('host');
  });

  it('emits exactly one creationInfo.creator with the sbom-pilot tool tag', () => {
    const doc = emitSpdx(irMinimal);
    const ci = doc['creationInfo'] as { created: string; creators: string[] };
    expect(ci.created).toBe(baseDocument.createdAt);
    expect(ci.creators).toEqual(['Tool: sbom-pilot-0.1.0']);
  });
});

describe('emitSpdx — packages projection', () => {
  it('emits one package per IR component', () => {
    const doc = emitSpdx(irMulti);
    const pkgs = doc['packages'] as Array<Record<string, unknown>>;
    expect(pkgs).toHaveLength(3);
  });

  it('sanitises SPDXIDs', () => {
    const doc = emitSpdx(irMulti);
    const ids = (doc['packages'] as Array<{ SPDXID: string }>).map(
      (p) => p.SPDXID,
    );
    expect(ids).toEqual([
      'SPDXRef-root',
      'SPDXRef-node-modules-scope-example',
      'SPDXRef-node-modules-typescript',
    ]);
  });

  it('preserves license expressions', () => {
    const doc = emitSpdx(irMulti);
    const scoped = (doc['packages'] as Array<{ name: string; licenseConcluded: string }>).find(
      (p) => p.name === '@scope/example',
    );
    expect(scoped?.licenseConcluded).toBe('MIT OR Apache-2.0');
  });

  it('drops license to NOASSERTION when IR component carries no license', () => {
    const doc = emitSpdx(irMulti);
    const ts = (doc['packages'] as Array<{ name: string; licenseConcluded: string }>).find(
      (p) => p.name === 'typescript',
    );
    expect(ts?.licenseConcluded).toBe('NOASSERTION');
  });

  it('emits supplier as "Organization: …" when IR supplies one', () => {
    const doc = emitSpdx(irMulti);
    const root = (doc['packages'] as Array<{ name: string; supplier: string }>).find(
      (p) => p.name === 'host-app',
    );
    expect(root?.supplier).toBe('Organization: Example Corp');
  });

  it('converts hash algorithm to the SPDX unhyphenated form', () => {
    const doc = emitSpdx(irMulti);
    const scoped = (
      doc['packages'] as Array<{
        name: string;
        checksums?: Array<{ algorithm: string; checksumValue: string }>;
      }>
    ).find((p) => p.name === '@scope/example');
    expect(scoped?.checksums?.[0]?.algorithm).toBe('SHA256');
    expect(scoped?.checksums?.[0]?.checksumValue).toBe('a'.repeat(64));
  });

  it('emits exactly one externalRefs entry per package with purl locator', () => {
    const doc = emitSpdx(irMinimal);
    const pkg = (doc['packages'] as Array<{
      externalRefs: Array<{
        referenceCategory: string;
        referenceType: string;
        referenceLocator: string;
      }>;
    }>)[0]!;
    expect(pkg.externalRefs).toEqual([
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: 'pkg:npm/example@1.0.0',
      },
    ]);
  });
});

describe('emitSpdx — relationships projection', () => {
  it('emits one DESCRIBES edge from SPDXRef-DOCUMENT to the root', () => {
    const doc = emitSpdx(irMinimal);
    const rels = doc['relationships'] as Array<Record<string, string>>;
    expect(rels[0]).toEqual({
      spdxElementId: 'SPDXRef-DOCUMENT',
      relatedSpdxElement: 'SPDXRef-root',
      relationshipType: 'DESCRIBES',
    });
  });

  it('appends one DEPENDS_ON edge per IR relationship', () => {
    const doc = emitSpdx(irMulti);
    const rels = doc['relationships'] as Array<Record<string, string>>;
    expect(rels).toHaveLength(3); // 1 DESCRIBES + 2 IR relationships
    expect(rels.slice(1)).toEqual([
      {
        spdxElementId: 'SPDXRef-root',
        relatedSpdxElement: 'SPDXRef-node-modules-scope-example',
        relationshipType: 'DEPENDS_ON',
      },
      {
        spdxElementId: 'SPDXRef-root',
        relatedSpdxElement: 'SPDXRef-node-modules-typescript',
        relationshipType: 'DEPENDS_ON',
      },
    ]);
  });
});

describe('emitSpdx — determinism (AC-001-8)', () => {
  for (const { name, ir } of fixtures) {
    it(`fixture "${name}" serialises identically on repeat calls`, () => {
      const a = serializeDocument(emitSpdx(ir));
      const b = serializeDocument(emitSpdx(ir));
      expect(a).toBe(b);
    });
  }
});
