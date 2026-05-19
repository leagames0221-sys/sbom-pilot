/**
 * Unit tests for the pnpm parser.
 *
 * Fixture: tests/fixtures/projects/pnpm-tiny/ — synthetic 4-dep project
 * declaring 3 production deps (one scoped) + 1 devDependency in a v9
 * lockfile. License fields are intentionally absent from the lockfile
 * (pnpm v9 omits them); the parser only enriches license for the root
 * component from package.json.
 *
 * Spec mapping: AC-001-1, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parsePnpmPackageKey,
  parsePnpmProject,
} from '../../../src/parsers/pnpm.js';
import { SbomIRSchema } from '../../../src/ir/index.js';

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'projects',
  'pnpm-tiny',
);

const parseFixture = () =>
  parsePnpmProject(fixtureDir, {
    namespace: 'urn:sbom-pilot:test:pnpm-tiny',
    creatorVersion: '0.0.0-test',
    createdAt: '2026-05-20T00:00:00Z',
  });

describe('parsePnpmPackageKey', () => {
  it('parses unscoped keys', () => {
    expect(parsePnpmPackageKey('lodash@4.17.21')).toEqual({
      name: 'lodash',
      version: '4.17.21',
    });
  });

  it('parses scoped keys', () => {
    expect(parsePnpmPackageKey('@scope/example@1.0.0')).toEqual({
      name: '@scope/example',
      version: '1.0.0',
    });
  });

  it('strips peer-dep suffix before splitting', () => {
    expect(parsePnpmPackageKey('react@18.2.0(react-dom@18.2.0)')).toEqual({
      name: 'react',
      version: '18.2.0',
    });
  });

  it('returns null for a malformed key with no version', () => {
    expect(parsePnpmPackageKey('lodash')).toBeNull();
  });

  it('returns null for a bare-@ key with no scope name', () => {
    expect(parsePnpmPackageKey('@@1.0.0')).toBeNull();
  });
});

describe('parsePnpmProject — pnpm-tiny fixture', () => {
  it('produces an IR that validates against SbomIRSchema', async () => {
    const ir = await parseFixture();
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });

  it('emits exactly 5 components (1 root + 4 packages)', async () => {
    const ir = await parseFixture();
    expect(ir.components).toHaveLength(5);
  });

  it('emits exactly 4 root-edge relationships', async () => {
    const ir = await parseFixture();
    expect(ir.relationships).toHaveLength(4);
    for (const rel of ir.relationships) {
      expect(rel.from).toBe('root');
    }
  });

  it('classifies 3 production deps as depends-on', async () => {
    const ir = await parseFixture();
    const prod = ir.relationships.filter((r) => r.type === 'depends-on');
    expect(prod).toHaveLength(3);
  });

  it('classifies the single devDependency as dev-depends-on', async () => {
    const ir = await parseFixture();
    const dev = ir.relationships.filter((r) => r.type === 'dev-depends-on');
    expect(dev).toHaveLength(1);
    expect(dev[0]?.to).toBe('typescript@5.7.2');
  });

  it('leaves license unset on lockfile-only dep components (v9 omits license)', async () => {
    const ir = await parseFixture();
    const deps = ir.components.filter((c) => c.id !== 'root');
    for (const dep of deps) {
      expect(dep.license).toBeUndefined();
    }
  });

  it('populates the root component license from package.json', async () => {
    const ir = await parseFixture();
    const root = ir.components.find((c) => c.id === 'root');
    expect(root?.license?.spdxId).toBe('MIT');
  });

  it('formats the scoped @scope/example purl per pURL spec', async () => {
    const ir = await parseFixture();
    const scoped = ir.components.find((c) => c.name === '@scope/example');
    expect(scoped?.purl).toBe('pkg:npm/%40scope/example@1.0.0');
  });

  it('marks every component ecosystem as npm', async () => {
    const ir = await parseFixture();
    for (const c of ir.components) {
      expect(c.ecosystem).toBe('npm');
    }
  });

  it('produces a deterministic IR for the same input twice', async () => {
    const a = await parseFixture();
    const b = await parseFixture();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('honors the namespace / creatorVersion / createdAt overrides', async () => {
    const ir = await parseFixture();
    expect(ir.document.namespace).toBe('urn:sbom-pilot:test:pnpm-tiny');
    expect(ir.document.creatorVersion).toBe('0.0.0-test');
    expect(ir.document.createdAt).toBe('2026-05-20T00:00:00Z');
  });

  it('emits the rootComponent reference pointing to a present id', async () => {
    const ir = await parseFixture();
    const ids = new Set(ir.components.map((c) => c.id));
    expect(ids.has(ir.document.rootComponent)).toBe(true);
  });

  it('uses the project name + version for the root component', async () => {
    const ir = await parseFixture();
    const root = ir.components.find((c) => c.id === 'root');
    expect(root?.name).toBe('pnpm-tiny-fixture');
    expect(root?.version).toBe('1.0.0');
    expect(root?.purl).toBe('pkg:npm/pnpm-tiny-fixture@1.0.0');
  });
});

describe('parsePnpmProject — error paths', () => {
  it('throws when the project directory has no pnpm-lock.yaml', async () => {
    await expect(parsePnpmProject('/no/such/path')).rejects.toThrow();
  });
});
