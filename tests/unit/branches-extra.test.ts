/**
 * Branches-coverage targeted unit tests.
 *
 * The base unit tests (one file per module) verify the canonical happy
 * paths required by the spec ACs. This file targets the remaining
 * uncovered branches surfaced by the v8 coverage reporter at the end of
 * L8, so the global branches threshold (vitest.config.ts) holds when the
 * 3-OS CI matrix runs at T-33.
 *
 * Each test names the file + uncovered branch it targets in a comment so
 * a coverage regression is trivial to triage from the failure output
 * alone.
 */
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseNpmProject } from '../../src/parsers/npm.js';
import { parsePnpmProject } from '../../src/parsers/pnpm.js';
import { parseGoModProject } from '../../src/parsers/go-mod.js';
import { parsePipProject } from '../../src/parsers/pip.js';
import { emitSpdx } from '../../src/emitters/spdx-2.3.js';
import { correlate } from '../../src/scanners/correlator.js';
import type { SbomIR } from '../../src/ir/index.js';
import type { OsvVulnerability, VulnDbCache } from '../../src/scanners/vuln-db.js';

function makeDb(advisories: OsvVulnerability[]): VulnDbCache {
  return {
    metadata: {
      schemaVersion: '1.0',
      lastUpdated: '2026-05-20T00:00:00Z',
      advisoryCount: advisories.length,
      source: 'test',
    },
    advisories,
  };
}

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `sbom-pilot-${prefix}-`));
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// npm parser — optional-depends-on + lockfile-extra-top-level + no-license
// Targets: src/parsers/npm.ts L207-211, L214-219, license-undefined branch
// ---------------------------------------------------------------------------

describe('npm parser — uncovered branches', () => {
  it('classifies entry.optional === true as optional-depends-on', async () => {
    const dir = await makeTempDir('npm-opt');
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'fixture',
          version: '1.0.0',
          dependencies: { 'opt-pkg': '^1.0.0' },
        }),
      );
      await writeFile(
        join(dir, 'package-lock.json'),
        JSON.stringify({
          name: 'fixture',
          version: '1.0.0',
          lockfileVersion: 3,
          packages: {
            '': {
              name: 'fixture',
              version: '1.0.0',
              dependencies: { 'opt-pkg': '^1.0.0' },
            },
            'node_modules/opt-pkg': {
              version: '1.0.0',
              license: 'MIT',
              optional: true,
            },
          },
        }),
      );
      const ir = await parseNpmProject(dir);
      const optRel = ir.relationships.find((r) => r.to.endsWith('opt-pkg'));
      expect(optRel?.type).toBe('optional-depends-on');
    } finally {
      await cleanup(dir);
    }
  });

  it('falls through to depends-on for a top-level package not in manifest', async () => {
    const dir = await makeTempDir('npm-extra');
    try {
      // The manifest declares zero dependencies; the lockfile lists a
      // top-level entry — this can legitimately happen mid-`npm install`.
      // The parser treats it as a production dep (lockfile = live SSoT).
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'fixture', version: '1.0.0' }),
      );
      await writeFile(
        join(dir, 'package-lock.json'),
        JSON.stringify({
          name: 'fixture',
          version: '1.0.0',
          lockfileVersion: 3,
          packages: {
            '': { name: 'fixture', version: '1.0.0' },
            'node_modules/orphan-pkg': { version: '0.1.0', license: 'MIT' },
          },
        }),
      );
      const ir = await parseNpmProject(dir);
      const orphan = ir.relationships.find((r) =>
        r.to.endsWith('orphan-pkg'),
      );
      expect(orphan?.type).toBe('depends-on');
    } finally {
      await cleanup(dir);
    }
  });

  it('omits the license field when the lockfile entry has none', async () => {
    const dir = await makeTempDir('npm-nolicense');
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'fixture',
          version: '1.0.0',
          dependencies: { 'plain-pkg': '^1.0.0' },
        }),
      );
      await writeFile(
        join(dir, 'package-lock.json'),
        JSON.stringify({
          name: 'fixture',
          version: '1.0.0',
          lockfileVersion: 3,
          packages: {
            '': {
              name: 'fixture',
              version: '1.0.0',
              dependencies: { 'plain-pkg': '^1.0.0' },
            },
            'node_modules/plain-pkg': { version: '1.0.0' },
          },
        }),
      );
      const ir = await parseNpmProject(dir);
      const plain = ir.components.find((c) => c.name === 'plain-pkg');
      expect(plain).toBeDefined();
      expect(plain?.license).toBeUndefined();
    } finally {
      await cleanup(dir);
    }
  });

  it('skips lockfile entries that lack a version field', async () => {
    const dir = await makeTempDir('npm-noversion');
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'fixture', version: '1.0.0' }),
      );
      await writeFile(
        join(dir, 'package-lock.json'),
        JSON.stringify({
          name: 'fixture',
          version: '1.0.0',
          lockfileVersion: 3,
          packages: {
            '': { name: 'fixture', version: '1.0.0' },
            'node_modules/no-version': {},
          },
        }),
      );
      const ir = await parseNpmProject(dir);
      expect(ir.components.find((c) => c.name === 'no-version')).toBeUndefined();
    } finally {
      await cleanup(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// pnpm parser — optionalDependencies path
// Targets: src/parsers/pnpm.ts L169-170
// ---------------------------------------------------------------------------

describe('pnpm parser — uncovered branches', () => {
  it('classifies directOptional entries as optional-depends-on', async () => {
    const dir = await makeTempDir('pnpm-opt');
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'fixture',
          version: '1.0.0',
          optionalDependencies: { 'maybe-pkg': '^1.0.0' },
        }),
      );
      const lock = [
        'lockfileVersion: \'9.0\'',
        'importers:',
        '  .:',
        '    optionalDependencies:',
        '      maybe-pkg:',
        '        specifier: ^1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  maybe-pkg@1.0.0:',
        '    resolution: {integrity: sha512-fake}',
        '',
      ].join('\n');
      await writeFile(join(dir, 'pnpm-lock.yaml'), lock);
      const ir = await parsePnpmProject(dir);
      const optRel = ir.relationships.find((r) => r.to.includes('maybe-pkg'));
      expect(optRel?.type).toBe('optional-depends-on');
    } finally {
      await cleanup(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// go-mod parser — go.sum missing + module-statement-absent fallback
// Targets: src/parsers/go-mod.ts L150-153, L157 fallback path
// ---------------------------------------------------------------------------

describe('go-mod parser — uncovered branches', () => {
  it('parses successfully when go.sum is absent (fresh module)', async () => {
    const dir = await makeTempDir('gomod-nosum');
    try {
      await writeFile(
        join(dir, 'go.mod'),
        [
          'module example.com/fresh',
          '',
          'go 1.22',
          '',
          'require github.com/stretchr/testify v1.9.0',
          '',
        ].join('\n'),
      );
      const ir = await parseGoModProject(dir);
      const root = ir.components.find((c) => c.id === ir.document.rootComponent);
      expect(root?.name).toBe('example.com/fresh');
    } finally {
      await cleanup(dir);
    }
  });

  it('falls back to projectDir basename when go.mod has no module statement', async () => {
    const dir = await makeTempDir('gomod-nomodule');
    try {
      await writeFile(
        join(dir, 'go.mod'),
        ['go 1.22', '', 'require example.com/foo v1.0.0', ''].join('\n'),
      );
      const ir = await parseGoModProject(dir);
      const root = ir.components.find((c) => c.id === ir.document.rootComponent);
      // basename of the temp dir is the fallback — non-empty, deterministic.
      expect(root?.name).toBeDefined();
      expect((root?.name ?? '').length).toBeGreaterThan(0);
    } finally {
      await cleanup(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// pip parser — `>=X.Y` range + default namespace + non-SHA-256 hash
// Targets: src/parsers/pip.ts L152-160 (range), L227-228 (default namespace),
// L213-214 (hash fallback to first when no SHA-256)
// ---------------------------------------------------------------------------

describe('pip parser — uncovered branches', () => {
  it('captures the lower bound of a `>=X.Y` range specifier', async () => {
    const dir = await makeTempDir('pip-range');
    try {
      await writeFile(
        join(dir, 'requirements.txt'),
        ['requests>=2.31.0', ''].join('\n'),
      );
      const ir = await parsePipProject(dir);
      const requests = ir.components.find((c) => c.name === 'requests');
      expect(requests).toBeDefined();
      expect(requests?.version).toBe('2.31.0');
    } finally {
      await cleanup(dir);
    }
  });

  it('falls back to default urn:sbom-pilot:pip namespace when none provided', async () => {
    const dir = await makeTempDir('pip-nsdefault');
    try {
      await writeFile(
        join(dir, 'requirements.txt'),
        ['flask==3.0.0', ''].join('\n'),
      );
      const ir = await parsePipProject(dir);
      expect(ir.document.namespace).toMatch(/^urn:sbom-pilot:pip:/);
    } finally {
      await cleanup(dir);
    }
  });

  it('falls back to first-listed hash when no SHA-256 is present', async () => {
    const dir = await makeTempDir('pip-noshahash');
    try {
      // The parser prefers SHA-256 when present, otherwise the first
      // listed hash. Provide only a SHA-512 line so the fallback path
      // (`parsed.hashes[0]`) is exercised.
      const sha512 =
        'cafebabedeadbeef'.repeat(8); // 128 hex chars (sha512 length)
      await writeFile(
        join(dir, 'requirements.txt'),
        [`only512pkg==1.0.0 --hash=sha512:${sha512}`, ''].join('\n'),
      );
      const ir = await parsePipProject(dir);
      const pkg = ir.components.find((c) => c.name === 'only512pkg');
      expect(pkg?.hash?.algorithm).toBe('SHA-512');
    } finally {
      await cleanup(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// SPDX emitter — license.name (no spdxId/expression) + NOASSERTION fallback
// Targets: src/emitters/spdx-2.3.ts L102-107 (LicenseRef-), L155 documentName
// fallback when rootComponent is absent.
// ---------------------------------------------------------------------------

describe('SPDX emitter — uncovered branches', () => {
  const baseIr = (overrides: Partial<SbomIR['components'][0]>): SbomIR => ({
    document: {
      namespace: 'urn:sbom-pilot:test:spdx-branches',
      createdAt: '2026-05-20T00:00:00Z',
      creator: 'sbom-pilot',
      creatorVersion: '0.0.0-test',
      rootComponent: 'root',
    },
    components: [
      {
        id: 'root',
        purl: 'pkg:npm/spdx-fixture@1.0.0',
        name: 'spdx-fixture',
        version: '1.0.0',
        ecosystem: 'npm',
      },
      {
        id: 'lic-name-only',
        purl: 'pkg:npm/lic-name-only@1.0.0',
        name: 'lic-name-only',
        version: '1.0.0',
        ecosystem: 'npm',
        ...overrides,
      },
    ],
    relationships: [
      { from: 'root', to: 'lic-name-only', type: 'depends-on' },
    ],
  });

  it('emits LicenseRef-<sanitised> when only license.name is set', () => {
    const ir = baseIr({ license: { name: 'My Custom License v2' } });
    const doc = emitSpdx(ir);
    const pkgs = doc['packages'] as Array<Record<string, unknown>>;
    const target = pkgs.find((p) => p['SPDXID'] === 'SPDXRef-lic-name-only');
    expect(target?.['licenseConcluded']).toMatch(/^LicenseRef-/);
    expect(target?.['licenseConcluded']).not.toBe('NOASSERTION');
  });

  it('emits LicenseRef-unknown when license.name sanitises to empty', () => {
    const ir = baseIr({ license: { name: '!!!@@@###' } });
    const doc = emitSpdx(ir);
    const pkgs = doc['packages'] as Array<Record<string, unknown>>;
    const target = pkgs.find((p) => p['SPDXID'] === 'SPDXRef-lic-name-only');
    expect(target?.['licenseConcluded']).toBe('LicenseRef-unknown');
  });

  it('falls back to NOASSERTION when license object exists but all fields empty', () => {
    const ir = baseIr({ license: {} });
    const doc = emitSpdx(ir);
    const pkgs = doc['packages'] as Array<Record<string, unknown>>;
    const target = pkgs.find((p) => p['SPDXID'] === 'SPDXRef-lic-name-only');
    expect(target?.['licenseConcluded']).toBe('NOASSERTION');
  });

  it('falls back to documentName="unnamed-project" when rootComponent id is absent', () => {
    const ir: SbomIR = {
      document: {
        namespace: 'urn:sbom-pilot:test:spdx-orphan',
        createdAt: '2026-05-20T00:00:00Z',
        creator: 'sbom-pilot',
        creatorVersion: '0.0.0-test',
        rootComponent: 'nonexistent',
      },
      components: [
        {
          id: 'only',
          purl: 'pkg:npm/only@1.0.0',
          name: 'only',
          version: '1.0.0',
          ecosystem: 'npm',
        },
      ],
      relationships: [],
    };
    const doc = emitSpdx(ir);
    expect(doc['name']).toBe('unnamed-project');
  });
});

// ---------------------------------------------------------------------------
// Correlator — normaliseSeverity fallback + non-SEMVER range short-circuit
// Targets: src/scanners/correlator.ts L260 (non-SEMVER), L276 (UNKNOWN fallback)
// ---------------------------------------------------------------------------

describe('Correlator — uncovered branches', () => {
  const makeIr = (componentVersion: string): SbomIR => ({
    document: {
      namespace: 'urn:sbom-pilot:test:correlator-branches',
      createdAt: '2026-05-20T00:00:00Z',
      creator: 'sbom-pilot',
      creatorVersion: '0.0.0-test',
      rootComponent: 'root',
    },
    components: [
      {
        id: 'root',
        purl: 'pkg:npm/host@1.0.0',
        name: 'host',
        version: '1.0.0',
        ecosystem: 'npm',
      },
      {
        id: 'pkg:npm/target@' + componentVersion,
        purl: `pkg:npm/target@${componentVersion}`,
        name: 'target',
        version: componentVersion,
        ecosystem: 'npm',
      },
    ],
    relationships: [
      {
        from: 'root',
        to: 'pkg:npm/target@' + componentVersion,
        type: 'depends-on',
      },
    ],
  });

  it('normaliseSeverity falls back to UNKNOWN for an unrecognised string', () => {
    const ir = makeIr('1.0.0');
    const advisories: OsvVulnerability[] = [
      {
        id: 'GHSA-fake-aaaa',
        summary: 'fake',
        affected: [
          {
            package: { ecosystem: 'npm', name: 'target', purl: 'pkg:npm/target' },
            ranges: [
              {
                type: 'SEMVER',
                events: [{ introduced: '0.0.0' }, { fixed: '2.0.0' }],
              },
            ],
          },
        ],
        database_specific: { severity: 'EXTREME-DANGEROUS' },
        references: [],
      },
    ];
    const findings = correlate(ir, makeDb(advisories));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('UNKNOWN');
  });

  it('non-SEMVER range types are not matched at Phase α scope', () => {
    const ir = makeIr('1.0.0');
    const advisories: OsvVulnerability[] = [
      {
        id: 'GHSA-fake-bbbb',
        summary: 'fake',
        affected: [
          {
            package: { ecosystem: 'npm', name: 'target', purl: 'pkg:npm/target' },
            ranges: [
              {
                type: 'ECOSYSTEM',
                events: [{ introduced: '0.0.0' }, { fixed: '2.0.0' }],
              },
            ],
          },
        ],
        references: [],
      },
    ];
    const findings = correlate(ir, makeDb(advisories));
    expect(findings).toHaveLength(0);
  });
});
