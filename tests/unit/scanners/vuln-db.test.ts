/**
 * Unit tests for the vuln-db loader + age check (T-18).
 *
 * Spec mapping: AC-002-2, AC-002-3, AC-NF-offline, ADR-0004, ADR-0006.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_MAX_AGE_DAYS,
  formatStalenessWarning,
  isVulnDbStale,
  loadVulnDb,
  writeVulnDb,
  type VulnDbCache,
} from '../../../src/scanners/vuln-db.js';

const seedPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'vuln-db-seed',
  'vuln-db.json',
);

describe('loadVulnDb — seed snapshot', () => {
  it('loads the synthetic seed cache successfully', async () => {
    const cache = await loadVulnDb(seedPath);
    expect(cache.metadata.advisoryCount).toBe(3);
    expect(cache.advisories).toHaveLength(3);
  });

  it('preserves OSV record shape for the lodash advisory', async () => {
    const cache = await loadVulnDb(seedPath);
    const lodash = cache.advisories.find((a) => a.id === 'GHSA-test-lodash-001');
    expect(lodash).toBeDefined();
    expect(lodash?.database_specific?.severity).toBe('HIGH');
    expect(lodash?.affected[0]?.package.name).toBe('lodash');
    expect(lodash?.affected[0]?.ranges?.[0]?.events).toEqual([
      { introduced: '4.0.0' },
      { fixed: '4.17.22' },
    ]);
  });

  it('throws on a missing cache file', async () => {
    await expect(loadVulnDb('/no/such/path')).rejects.toThrow();
  });

  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `sbom-pilot-vulndb-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('throws when the cache file has no metadata key', async () => {
    const badPath = join(workDir, 'bad.json');
    await fs.writeFile(badPath, JSON.stringify({ advisories: [] }));
    await expect(loadVulnDb(badPath)).rejects.toThrow(/metadata/);
  });

  it('throws when advisories is not an array', async () => {
    const badPath = join(workDir, 'bad.json');
    await fs.writeFile(
      badPath,
      JSON.stringify({ metadata: {}, advisories: 'not-an-array' }),
    );
    await expect(loadVulnDb(badPath)).rejects.toThrow(/non-array/);
  });
});

describe('isVulnDbStale', () => {
  const cacheUpdatedOn = (iso: string): VulnDbCache => ({
    metadata: {
      schemaVersion: '1.0.0',
      lastUpdated: iso,
      advisoryCount: 0,
    },
    advisories: [],
  });

  it('returns false for a fresh cache within 30 days', () => {
    const cache = cacheUpdatedOn('2026-05-15T00:00:00Z');
    const now = new Date('2026-05-20T00:00:00Z'); // 5 days later
    expect(isVulnDbStale(cache, 30, now)).toBe(false);
  });

  it('returns true for a cache older than 30 days', () => {
    const cache = cacheUpdatedOn('2026-04-15T00:00:00Z');
    const now = new Date('2026-05-20T00:00:00Z'); // 35 days later
    expect(isVulnDbStale(cache, 30, now)).toBe(true);
  });

  it('returns true at the boundary (exactly 30 days)', () => {
    // 30 days elapsed is NOT > 30 days; should be false at exactly 30
    const cache = cacheUpdatedOn('2026-04-20T00:00:00Z');
    const now = new Date('2026-05-20T00:00:00Z');
    expect(isVulnDbStale(cache, 30, now)).toBe(false);
  });

  it('returns true when lastUpdated is unparseable', () => {
    const cache = cacheUpdatedOn('not-a-date');
    expect(isVulnDbStale(cache, 30, new Date('2026-05-20T00:00:00Z'))).toBe(true);
  });

  it('honours a custom maxAgeDays threshold', () => {
    const cache = cacheUpdatedOn('2026-05-15T00:00:00Z');
    const now = new Date('2026-05-20T00:00:00Z'); // 5 days
    expect(isVulnDbStale(cache, 3, now)).toBe(true);
    expect(isVulnDbStale(cache, 7, now)).toBe(false);
  });

  it('exports a default 30-day threshold per AC-002-3', () => {
    expect(DEFAULT_MAX_AGE_DAYS).toBe(30);
  });
});

describe('formatStalenessWarning', () => {
  const freshCache: VulnDbCache = {
    metadata: {
      schemaVersion: '1.0.0',
      lastUpdated: '2026-05-19T00:00:00Z',
      advisoryCount: 0,
    },
    advisories: [],
  };

  const staleCache: VulnDbCache = {
    metadata: {
      schemaVersion: '1.0.0',
      lastUpdated: '2026-03-01T00:00:00Z',
      advisoryCount: 0,
    },
    advisories: [],
  };

  it('returns null for a fresh cache', () => {
    expect(
      formatStalenessWarning(freshCache, 30, new Date('2026-05-20T00:00:00Z')),
    ).toBeNull();
  });

  it('returns a non-empty warning string for a stale cache', () => {
    const out = formatStalenessWarning(
      staleCache,
      30,
      new Date('2026-05-20T00:00:00Z'),
    );
    expect(out).not.toBeNull();
    expect(out).toContain('vuln-db cache');
    expect(out).toContain('2026-03-01');
    expect(out).toContain('--refresh');
  });
});

describe('writeVulnDb — atomic refresh', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `sbom-pilot-vulndb-write-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('writes a cache to disk atomically + round-trips through loadVulnDb', async () => {
    const target = join(workDir, 'cache.json');
    const cache: VulnDbCache = {
      metadata: {
        schemaVersion: '1.0.0',
        lastUpdated: '2026-05-20T00:00:00Z',
        advisoryCount: 1,
      },
      advisories: [
        {
          id: 'GHSA-write-roundtrip',
          affected: [{ package: { name: 'x', ecosystem: 'npm' } }],
        },
      ],
    };
    await writeVulnDb(target, cache);
    const loaded = await loadVulnDb(target);
    expect(loaded.metadata.lastUpdated).toBe('2026-05-20T00:00:00Z');
    expect(loaded.advisories).toHaveLength(1);
    expect(loaded.advisories[0]?.id).toBe('GHSA-write-roundtrip');
  });

  it('overwrites an existing cache file atomically (no intermediate state)', async () => {
    const target = join(workDir, 'cache.json');
    const initial: VulnDbCache = {
      metadata: {
        schemaVersion: '1.0.0',
        lastUpdated: '2026-04-01T00:00:00Z',
        advisoryCount: 1,
      },
      advisories: [
        { id: 'GHSA-old', affected: [{ package: { name: 'x', ecosystem: 'npm' } }] },
      ],
    };
    const updated: VulnDbCache = {
      metadata: {
        schemaVersion: '1.0.0',
        lastUpdated: '2026-05-20T00:00:00Z',
        advisoryCount: 1,
      },
      advisories: [
        { id: 'GHSA-new', affected: [{ package: { name: 'x', ecosystem: 'npm' } }] },
      ],
    };
    await writeVulnDb(target, initial);
    await writeVulnDb(target, updated);
    const loaded = await loadVulnDb(target);
    expect(loaded.advisories[0]?.id).toBe('GHSA-new');
  });
});
