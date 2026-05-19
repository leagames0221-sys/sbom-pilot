/**
 * Unit tests for the correlator (T-19).
 *
 * Combines the npm-tiny parser fixture (5 components incl. lodash /
 * express / chalk) with the seed vuln-db (3 advisories) to assert
 * the expected 3 matching findings.
 *
 * Spec mapping: AC-002-1, AC-002-6, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  compareSemver,
  correlate,
  isVersionInRange,
  type Finding,
} from '../../../src/scanners/correlator.js';
import { loadVulnDb } from '../../../src/scanners/vuln-db.js';
import { parseNpmProject } from '../../../src/parsers/npm.js';

const here = dirname(fileURLToPath(import.meta.url));
const npmFixturePath = join(
  here,
  '..',
  '..',
  'fixtures',
  'projects',
  'npm-tiny',
);
const vulnDbPath = join(
  here,
  '..',
  '..',
  'fixtures',
  'vuln-db-seed',
  'vuln-db.json',
);

const parseFixture = () =>
  parseNpmProject(npmFixturePath, {
    namespace: 'urn:sbom-pilot:test:correlate',
    createdAt: '2026-05-20T00:00:00Z',
    creatorVersion: '0.0.0-test',
  });

describe('compareSemver', () => {
  it('orders X.Y.Z triples numerically', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('honours the leading v prefix', () => {
    expect(compareSemver('v1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('v1.2.4', '1.2.3')).toBe(1);
  });

  it('compares major / minor before patch', () => {
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
    expect(compareSemver('1.10.0', '1.2.0')).toBe(1);
  });

  it('treats pre-release suffix as less than the release', () => {
    expect(compareSemver('1.2.3-rc1', '1.2.3')).toBe(-1);
    expect(compareSemver('1.2.3', '1.2.3-rc1')).toBe(1);
  });

  it('falls back to lexical for non-semver inputs', () => {
    expect(compareSemver('abc', 'abd')).toBe(-1);
    expect(compareSemver('abc', 'abc')).toBe(0);
  });
});

describe('isVersionInRange — SEMVER ranges', () => {
  it('matches a version below the fixed boundary', () => {
    const out = isVersionInRange('4.17.21', {
      type: 'SEMVER',
      events: [{ introduced: '4.0.0' }, { fixed: '4.17.22' }],
    });
    expect(out.affected).toBe(true);
    expect(out.matchedEvent).toEqual({
      introduced: '4.0.0',
      fixed: '4.17.22',
    });
  });

  it('rejects a version at or above the fixed boundary', () => {
    expect(
      isVersionInRange('4.17.22', {
        type: 'SEMVER',
        events: [{ introduced: '4.0.0' }, { fixed: '4.17.22' }],
      }).affected,
    ).toBe(false);
    expect(
      isVersionInRange('4.17.30', {
        type: 'SEMVER',
        events: [{ introduced: '4.0.0' }, { fixed: '4.17.22' }],
      }).affected,
    ).toBe(false);
  });

  it('rejects a version below the introduced boundary', () => {
    expect(
      isVersionInRange('3.99.0', {
        type: 'SEMVER',
        events: [{ introduced: '4.0.0' }, { fixed: '4.17.22' }],
      }).affected,
    ).toBe(false);
  });

  it('treats last_affected as an inclusive upper bound', () => {
    const out = isVersionInRange('4.17.22', {
      type: 'SEMVER',
      events: [{ introduced: '4.0.0' }, { last_affected: '4.17.22' }],
    });
    expect(out.affected).toBe(true);
  });

  it('handles multi-window ranges (multiple introduced/fixed pairs)', () => {
    const range = {
      type: 'SEMVER' as const,
      events: [
        { introduced: '1.0.0' },
        { fixed: '1.5.0' },
        { introduced: '2.0.0' },
        { fixed: '2.3.0' },
      ],
    };
    expect(isVersionInRange('1.4.0', range).affected).toBe(true);
    expect(isVersionInRange('1.5.0', range).affected).toBe(false);
    expect(isVersionInRange('1.9.0', range).affected).toBe(false);
    expect(isVersionInRange('2.0.0', range).affected).toBe(true);
    expect(isVersionInRange('2.2.0', range).affected).toBe(true);
    expect(isVersionInRange('2.3.0', range).affected).toBe(false);
  });

  it('returns affected for any introduced when no fixed event follows', () => {
    expect(
      isVersionInRange('99.99.99', {
        type: 'SEMVER',
        events: [{ introduced: '1.0.0' }],
      }).affected,
    ).toBe(true);
  });

  it('does not match non-SEMVER range types', () => {
    expect(
      isVersionInRange('1.0.0', {
        type: 'ECOSYSTEM',
        events: [{ introduced: '0.0.0' }],
      }).affected,
    ).toBe(false);
    expect(
      isVersionInRange('abc', {
        type: 'GIT',
        events: [{ introduced: '0' }],
      }).affected,
    ).toBe(false);
  });
});

describe('correlate — npm-tiny × seed DB', () => {
  let findings: Finding[];

  it('emits exactly 3 findings across the 5 IR components', async () => {
    const ir = await parseFixture();
    const db = await loadVulnDb(vulnDbPath);
    findings = correlate(ir, db);
    expect(findings).toHaveLength(3);
  });

  it('identifies lodash 4.17.21 as affected (GHSA-test-lodash-001)', async () => {
    const ir = await parseFixture();
    const db = await loadVulnDb(vulnDbPath);
    const lodash = correlate(ir, db).find(
      (f) => f.componentName === 'lodash',
    );
    expect(lodash).toBeDefined();
    expect(lodash?.advisoryId).toBe('GHSA-test-lodash-001');
    expect(lodash?.componentVersion).toBe('4.17.21');
    expect(lodash?.severity).toBe('HIGH');
    expect(lodash?.suggestedUpgrade).toBe('4.17.22');
    expect(lodash?.aliases).toContain('CVE-2026-99001');
  });

  it('identifies express 4.21.0 as affected (GHSA-test-express-002)', async () => {
    const ir = await parseFixture();
    const db = await loadVulnDb(vulnDbPath);
    const express = correlate(ir, db).find(
      (f) => f.componentName === 'express',
    );
    expect(express).toBeDefined();
    expect(express?.advisoryId).toBe('GHSA-test-express-002');
    expect(express?.severity).toBe('MODERATE');
    expect(express?.suggestedUpgrade).toBe('4.21.1');
  });

  it('identifies chalk 5.3.0 as affected (GHSA-test-chalk-003)', async () => {
    const ir = await parseFixture();
    const db = await loadVulnDb(vulnDbPath);
    const chalk = correlate(ir, db).find(
      (f) => f.componentName === 'chalk',
    );
    expect(chalk).toBeDefined();
    expect(chalk?.advisoryId).toBe('GHSA-test-chalk-003');
    expect(chalk?.severity).toBe('LOW');
    expect(chalk?.suggestedUpgrade).toBe('5.3.1');
  });

  it('does not match @scope/example or typescript', async () => {
    const ir = await parseFixture();
    const db = await loadVulnDb(vulnDbPath);
    const names = correlate(ir, db).map((f) => f.componentName);
    expect(names).not.toContain('@scope/example');
    expect(names).not.toContain('typescript');
    expect(names).not.toContain('npm-tiny-fixture'); // root
  });

  it('preserves the IR component id (not the pURL) in finding.componentId', async () => {
    const ir = await parseFixture();
    const db = await loadVulnDb(vulnDbPath);
    const lodash = correlate(ir, db).find(
      (f) => f.componentName === 'lodash',
    );
    expect(lodash?.componentId).toBe('node_modules/lodash');
  });

  it('attaches OSV references to each finding', async () => {
    const ir = await parseFixture();
    const db = await loadVulnDb(vulnDbPath);
    const lodash = correlate(ir, db).find(
      (f) => f.componentName === 'lodash',
    );
    expect(lodash?.references[0]?.url).toBe(
      'https://example.com/GHSA-test-lodash-001',
    );
  });
});

describe('correlate — determinism', () => {
  it('returns findings in stable order for the same input twice', async () => {
    const ir = await parseFixture();
    const db = await loadVulnDb(vulnDbPath);
    const a = correlate(ir, db);
    const b = correlate(ir, db);
    expect(a.map((f) => f.advisoryId)).toEqual(b.map((f) => f.advisoryId));
  });
});
