/**
 * Unit tests for the npm parser.
 *
 * Fixture: tests/fixtures/projects/npm-tiny/ — synthetic 5-dep project
 * declaring 4 production deps (one scoped: @scope/example) + 1 devDependency,
 * each resolved in package-lock.json v3 with a license string.
 *
 * Spec mapping: AC-001-1, AC-001-7, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  npmPurl,
  parseNpmProject,
} from '../../../src/parsers/npm.js';
import { SbomIRSchema } from '../../../src/ir/index.js';

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'projects',
  'npm-tiny',
);

const parseFixture = () =>
  parseNpmProject(fixtureDir, {
    namespace: 'urn:sbom-pilot:test:npm-tiny',
    creatorVersion: '0.0.0-test',
    createdAt: '2026-05-19T00:00:00Z',
  });

describe('npmPurl', () => {
  it('formats unscoped packages as pkg:npm/<name>@<version>', () => {
    expect(npmPurl('lodash', '4.17.21')).toBe('pkg:npm/lodash@4.17.21');
  });

  it('formats scoped packages with %40-encoded scope prefix', () => {
    expect(npmPurl('@scope/example', '1.0.0')).toBe(
      'pkg:npm/%40scope/example@1.0.0',
    );
  });

  it('leaves bare-@ strings without a slash alone (defensive)', () => {
    expect(npmPurl('@malformed', '1.0.0')).toBe('pkg:npm/@malformed@1.0.0');
  });
});

describe('parseNpmProject — npm-tiny fixture', () => {
  it('produces an IR that validates against SbomIRSchema', async () => {
    const ir = await parseFixture();
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });

  it('emits exactly 6 components (1 root + 5 resolved deps)', async () => {
    const ir = await parseFixture();
    expect(ir.components).toHaveLength(6);
  });

  it('emits exactly 5 root-edge relationships', async () => {
    const ir = await parseFixture();
    expect(ir.relationships).toHaveLength(5);
    for (const rel of ir.relationships) {
      expect(rel.from).toBe('root');
    }
  });

  it('classifies 4 production deps as depends-on', async () => {
    const ir = await parseFixture();
    const prod = ir.relationships.filter((r) => r.type === 'depends-on');
    expect(prod).toHaveLength(4);
  });

  it('classifies the single devDependency as dev-depends-on', async () => {
    const ir = await parseFixture();
    const dev = ir.relationships.filter((r) => r.type === 'dev-depends-on');
    expect(dev).toHaveLength(1);
    expect(dev[0]?.to).toBe('node_modules/typescript');
  });

  it('populates license fields on every resolved dep', async () => {
    const ir = await parseFixture();
    const deps = ir.components.filter((c) => c.id !== 'root');
    for (const dep of deps) {
      expect(dep.license).toBeDefined();
      expect(dep.license?.spdxId).toBeTruthy();
    }
  });

  it('preserves the literal SPDX strings (MIT / ISC / Apache-2.0)', async () => {
    const ir = await parseFixture();
    const byName = new Map(ir.components.map((c) => [c.name, c]));
    expect(byName.get('lodash')?.license?.spdxId).toBe('MIT');
    expect(byName.get('chalk')?.license?.spdxId).toBe('MIT');
    expect(byName.get('express')?.license?.spdxId).toBe('MIT');
    expect(byName.get('@scope/example')?.license?.spdxId).toBe('ISC');
    expect(byName.get('typescript')?.license?.spdxId).toBe('Apache-2.0');
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
    expect(ir.document.namespace).toBe('urn:sbom-pilot:test:npm-tiny');
    expect(ir.document.creatorVersion).toBe('0.0.0-test');
    expect(ir.document.createdAt).toBe('2026-05-19T00:00:00Z');
    expect(ir.document.creator).toBe('sbom-pilot');
  });

  it('uses the project name + version for the root component', async () => {
    const ir = await parseFixture();
    const root = ir.components.find((c) => c.id === 'root');
    expect(root).toBeDefined();
    expect(root?.name).toBe('npm-tiny-fixture');
    expect(root?.version).toBe('1.0.0');
    expect(root?.license?.spdxId).toBe('MIT');
    expect(root?.purl).toBe('pkg:npm/npm-tiny-fixture@1.0.0');
  });

  it('emits the rootComponent reference pointing to a present id', async () => {
    const ir = await parseFixture();
    const ids = new Set(ir.components.map((c) => c.id));
    expect(ids.has(ir.document.rootComponent)).toBe(true);
  });
});

describe('parseNpmProject — error paths', () => {
  it('throws when the project directory has no package.json', async () => {
    await expect(parseNpmProject('/no/such/path')).rejects.toThrow();
  });
});
