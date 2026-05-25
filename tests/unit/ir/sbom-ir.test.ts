/**
 * Type-level conformance tests for the SBOM IR shape.
 *
 * Asserts that the exported types in `src/ir/sbom-ir.ts` match the contract
 * locked in ADR-0005 §Decision. These are compile-time assertions made
 * runtime-visible via `expectTypeOf` so a structural drift surfaces as a
 * vitest failure rather than a silent type loosening.
 *
 * Source of truth: docs/adr/0005-sbom-format-ir.md
 */
import { describe, expectTypeOf, it } from 'vitest';
import type {
  Component,
  ComponentHash,
  ComponentRef,
  Ecosystem,
  LicenseExpression,
  Relationship,
  SbomDocument,
  SbomIR,
} from '../../../src/ir/sbom-ir.js';

describe('SbomIR type contract (ADR-0005)', () => {
  it('ComponentRef is a string alias', () => {
    expectTypeOf<ComponentRef>().toEqualTypeOf<string>();
  });

  it('Ecosystem is a closed union of 6 literals', () => {
    expectTypeOf<Ecosystem>().toEqualTypeOf<
      'npm' | 'PyPI' | 'Go' | 'Maven' | 'crates.io' | 'unknown'
    >();
  });

  it('ComponentHash carries algorithm + value, no other required keys', () => {
    expectTypeOf<ComponentHash>().toEqualTypeOf<{
      algorithm: 'SHA-256' | 'SHA-512';
      value: string;
    }>();
  });

  it('LicenseExpression has all three fields optional', () => {
    expectTypeOf<LicenseExpression>().toEqualTypeOf<{
      spdxId?: string | undefined;
      name?: string | undefined;
      expression?: string | undefined;
    }>();
  });

  it('Component required fields are id/purl/name/version/ecosystem', () => {
    const minimal: Component = {
      id: 'comp-1',
      purl: 'pkg:npm/example@1.0.0',
      name: 'example',
      version: '1.0.0',
      ecosystem: 'npm',
    };
    expectTypeOf(minimal).toMatchTypeOf<Component>();
  });

  it('Component supplier/license/hash are optional', () => {
    expectTypeOf<Component>().toHaveProperty('supplier').toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Component>().toHaveProperty('license').toEqualTypeOf<
      LicenseExpression | undefined
    >();
    expectTypeOf<Component>().toHaveProperty('hash').toEqualTypeOf<
      ComponentHash | undefined
    >();
  });

  it('Relationship.from / to are ComponentRef', () => {
    expectTypeOf<Relationship>().toHaveProperty('from').toEqualTypeOf<ComponentRef>();
    expectTypeOf<Relationship>().toHaveProperty('to').toEqualTypeOf<ComponentRef>();
  });

  it('Relationship.type is the 3-literal union from ADR-0005', () => {
    expectTypeOf<Relationship['type']>().toEqualTypeOf<
      'depends-on' | 'dev-depends-on' | 'optional-depends-on'
    >();
  });

  it('SbomDocument.creator is the literal "sbom-pilot"', () => {
    expectTypeOf<SbomDocument['creator']>().toEqualTypeOf<'sbom-pilot'>();
  });

  it('SbomDocument required fields match ADR-0005', () => {
    const doc: SbomDocument = {
      namespace: 'urn:uuid:test',
      createdAt: '2026-05-19T00:00:00Z',
      creator: 'sbom-pilot',
      creatorVersion: '0.1.0',
      rootComponent: 'comp-root',
    };
    expectTypeOf(doc).toMatchTypeOf<SbomDocument>();
  });

  it('SbomIR is { document, components[], relationships[] }', () => {
    expectTypeOf<SbomIR>().toHaveProperty('document').toEqualTypeOf<SbomDocument>();
    expectTypeOf<SbomIR>().toHaveProperty('components').toEqualTypeOf<Component[]>();
    expectTypeOf<SbomIR>().toHaveProperty('relationships').toEqualTypeOf<
      Relationship[]
    >();
  });

  it('a fully-populated SbomIR literal is assignable', () => {
    const ir: SbomIR = {
      document: {
        namespace: 'urn:uuid:abc',
        createdAt: '2026-05-19T00:00:00Z',
        creator: 'sbom-pilot',
        creatorVersion: '0.1.0',
        rootComponent: 'root',
      },
      components: [
        {
          id: 'root',
          purl: 'pkg:npm/root-app@1.0.0',
          name: 'root-app',
          version: '1.0.0',
          ecosystem: 'npm',
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
          purl: 'pkg:npm/lodash@4.17.21',
          name: 'lodash',
          version: '4.17.21',
          ecosystem: 'npm',
        },
      ],
      relationships: [
        { from: 'root', to: 'dep-1', type: 'depends-on' },
      ],
    };
    expectTypeOf(ir).toMatchTypeOf<SbomIR>();
  });
});
