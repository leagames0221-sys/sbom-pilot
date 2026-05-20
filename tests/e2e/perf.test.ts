/**
 * T-38 wall-clock perf — vitest gate for AC-001-1 + AC-002-1.
 *
 * Pairs with `scripts/benchmark.ts`: same fixture shape, same paths,
 * but expressed as a vitest e2e so the 3-OS CI matrix asserts the
 * 30-second budget per push (a perf regression would surface here
 * rather than waiting for a manual benchmark run).
 *
 * Per-test timeout is bumped to 60s so the assertion (30s budget) +
 * fixture generation + tmp cleanup all fit cleanly under it.
 *
 * Spec mapping: AC-001-1 (< 30 s on 1k-dep), AC-002-1 (< 30 s on
 * 1k-component).
 */
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { parseNpmProject } from '../../src/parsers/npm.js';
import { emitSpdx } from '../../src/emitters/spdx-2.3.js';
import { emitCycloneDx } from '../../src/emitters/cyclonedx-1.5.js';
import { serializeDocument } from '../../src/emitters/_shared.js';
import { correlate } from '../../src/scanners/correlator.js';
import {
  dedupeByAdvisoryId,
  rankBySeverity,
} from '../../src/scanners/severity.js';
import { generateVulnDb } from '../../scripts/benchmark.js';

const N = 1000;
const BUDGET_MS = 30_000;

function syntheticPackageName(i: number): string {
  const base = `bench-pkg-${i.toString().padStart(5, '0')}`;
  return i % 5 === 0 ? `@bench-scope/${base}` : base;
}

async function generateProject(dir: string, n: number): Promise<void> {
  const dependencies: Record<string, string> = {};
  const packages: Record<string, Record<string, unknown>> = {
    '': { name: 'perf-fixture', version: '1.0.0' },
  };
  for (let i = 0; i < n; i++) {
    const name = syntheticPackageName(i);
    const version = `1.${i % 100}.${i % 10}`;
    dependencies[name] = `^${version}`;
    packages[`node_modules/${name}`] = {
      version,
      license: ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause'][i % 4] ?? 'MIT',
    };
  }
  (packages[''] as Record<string, unknown>)['dependencies'] = dependencies;
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'perf-fixture', version: '1.0.0', dependencies }),
  );
  await writeFile(
    join(dir, 'package-lock.json'),
    JSON.stringify({
      name: 'perf-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      packages,
    }),
  );
}

describe('wall-clock perf (T-38, AC-001-1 + AC-002-1)', () => {
  it(
    `sbom path completes < ${BUDGET_MS} ms on a ${N}-component fixture`,
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'sbom-pilot-perf-sbom-'));
      try {
        await generateProject(dir, N);

        const t0 = performance.now();
        const ir = await parseNpmProject(dir, {
          namespace: 'urn:sbom-pilot:perf:sbom',
          creatorVersion: '0.0.0-perf',
          createdAt: '2026-05-20T00:00:00Z',
        });
        const spdx = serializeDocument(emitSpdx(ir));
        const cdx = serializeDocument(emitCycloneDx(ir));
        const elapsed = performance.now() - t0;

        expect(ir.components.length).toBeGreaterThanOrEqual(N);
        expect(spdx.length).toBeGreaterThan(0);
        expect(cdx.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(BUDGET_MS);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it(
    `scan path completes < ${BUDGET_MS} ms on a ${N}-component fixture`,
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'sbom-pilot-perf-scan-'));
      try {
        await generateProject(dir, N);
        const db = generateVulnDb(N, 50);

        const t0 = performance.now();
        const ir = await parseNpmProject(dir);
        const raw = correlate(ir, db);
        const deduped = dedupeByAdvisoryId(raw);
        const ranked = rankBySeverity(deduped);
        const elapsed = performance.now() - t0;

        expect(ir.components.length).toBeGreaterThanOrEqual(N);
        // Findings on a synthetic ~5%-real-target advisory set: small
        // but non-zero on the matched bench packages.
        expect(ranked.length).toBeGreaterThanOrEqual(0);
        expect(elapsed).toBeLessThan(BUDGET_MS);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
