/**
 * Runtime-validation tests for the zod IR schemas.
 *
 * 5 positive fixtures (must `parse()` cleanly) + 10 negative fixtures (must
 * throw / `safeParse` → success: false). Drift between sbom-ir.ts and
 * schemas.ts surfaces here.
 *
 * Spec mapping: AC-001-5, AC-001-6, ADR-0005.
 */
import { describe, expect, it } from 'vitest';
import {
  ComponentSchema,
  EcosystemSchema,
  LicenseExpressionSchema,
  RelationshipSchema,
  SbomDocumentSchema,
  SbomIRSchema,
} from '../../../src/ir/schemas.js';

const validDocument = {
  namespace: 'urn:uuid:doc-1',
  createdAt: '2026-05-19T00:00:00Z',
  creator: 'sbom-pilot',
  creatorVersion: '0.1.0',
  rootComponent: 'root',
};

const validComponent = {
  id: 'root',
  purl: 'pkg:npm/root-app@1.0.0',
  name: 'root-app',
  version: '1.0.0',
  ecosystem: 'npm',
};

const validRelationship = {
  from: 'root',
  to: 'dep-1',
  type: 'depends-on',
};

describe('IR schemas — positive fixtures (5)', () => {
  it('P1: minimal SbomIR — empty components + relationships', () => {
    const ir = {
      document: validDocument,
      components: [],
      relationships: [],
    };
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });

  it('P2: single-component SbomIR', () => {
    const ir = {
      document: validDocument,
      components: [validComponent],
      relationships: [],
    };
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });

  it('P3: SbomIR with fully-populated optional fields', () => {
    const ir = {
      document: validDocument,
      components: [
        {
          ...validComponent,
          supplier: 'tomohiro takada',
          license: { spdxId: 'MIT' },
          hash: {
            algorithm: 'SHA-256',
            value:
              '0000000000000000000000000000000000000000000000000000000000000000',
          },
        },
        {
          id: 'dep-1',
          purl: 'pkg:pypi/requests@2.31.0',
          name: 'requests',
          version: '2.31.0',
          ecosystem: 'PyPI',
          license: { expression: 'Apache-2.0' },
        },
      ],
      relationships: [{ ...validRelationship }],
    };
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });

  it('P4: SbomIR with all three relationship types', () => {
    const ir = {
      document: validDocument,
      components: [
        validComponent,
        { ...validComponent, id: 'dep-1', name: 'dep1', purl: 'pkg:npm/dep1@1.0.0' },
        { ...validComponent, id: 'dep-2', name: 'dep2', purl: 'pkg:npm/dep2@1.0.0' },
        { ...validComponent, id: 'dep-3', name: 'dep3', purl: 'pkg:npm/dep3@1.0.0' },
      ],
      relationships: [
        { from: 'root', to: 'dep-1', type: 'depends-on' },
        { from: 'root', to: 'dep-2', type: 'dev-depends-on' },
        { from: 'root', to: 'dep-3', type: 'optional-depends-on' },
      ],
    };
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });

  it('P5: SbomIR with all 6 ecosystems represented', () => {
    const ir = {
      document: validDocument,
      components: ['npm', 'PyPI', 'Go', 'Maven', 'crates.io', 'unknown'].map(
        (eco, i) => ({
          id: `c-${i}`,
          purl: `pkg:${eco.toLowerCase()}/x@1`,
          name: `c-${i}`,
          version: '1.0.0',
          ecosystem: eco,
        }),
      ),
      relationships: [],
    };
    // root not present here but doc requires its rootComponent string — schema
    // does not cross-validate referential integrity (that's a future layer);
    // schema only validates shape.
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });
});

describe('IR schemas — negative fixtures (10)', () => {
  it('N1: SbomIR missing document key', () => {
    const r = SbomIRSchema.safeParse({ components: [], relationships: [] });
    expect(r.success).toBe(false);
  });

  it('N2: SbomIR.components is not an array', () => {
    const r = SbomIRSchema.safeParse({
      document: validDocument,
      components: 'not-an-array',
      relationships: [],
    });
    expect(r.success).toBe(false);
  });

  it('N3: Component missing required `id`', () => {
    const { id: _id, ...noId } = validComponent;
    void _id;
    const r = ComponentSchema.safeParse(noId);
    expect(r.success).toBe(false);
  });

  it('N4: Component missing required `purl`', () => {
    const { purl: _purl, ...noPurl } = validComponent;
    void _purl;
    const r = ComponentSchema.safeParse(noPurl);
    expect(r.success).toBe(false);
  });

  it('N5: Component.ecosystem is an unknown literal', () => {
    const r = ComponentSchema.safeParse({
      ...validComponent,
      ecosystem: 'rubygems',
    });
    expect(r.success).toBe(false);
  });

  it('N6: ComponentHash.algorithm is unsupported', () => {
    const r = ComponentSchema.safeParse({
      ...validComponent,
      hash: { algorithm: 'MD5', value: 'abc' },
    });
    expect(r.success).toBe(false);
  });

  it('N7: Relationship missing `from`', () => {
    const { from: _from, ...noFrom } = validRelationship;
    void _from;
    const r = RelationshipSchema.safeParse(noFrom);
    expect(r.success).toBe(false);
  });

  it('N8: Relationship.type is an invalid string', () => {
    const r = RelationshipSchema.safeParse({
      from: 'a',
      to: 'b',
      type: 'contains',
    });
    expect(r.success).toBe(false);
  });

  it('N9: SbomDocument.creator is not the "sbom-pilot" literal', () => {
    const r = SbomDocumentSchema.safeParse({
      ...validDocument,
      creator: 'other-tool',
    });
    expect(r.success).toBe(false);
  });

  it('N10: LicenseExpression with a wrong-type field rejects', () => {
    const r = LicenseExpressionSchema.safeParse({ spdxId: 42 });
    expect(r.success).toBe(false);
  });
});

describe('IR schemas — EcosystemSchema spot checks', () => {
  it('accepts all 6 valid ecosystems', () => {
    for (const eco of [
      'npm',
      'PyPI',
      'Go',
      'Maven',
      'crates.io',
      'unknown',
    ] as const) {
      expect(EcosystemSchema.parse(eco)).toBe(eco);
    }
  });

  it('rejects empty string', () => {
    expect(EcosystemSchema.safeParse('').success).toBe(false);
  });
});
