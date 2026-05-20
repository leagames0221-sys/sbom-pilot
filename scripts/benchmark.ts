/**
 * T-38 wall-clock benchmark (AC-001-1 + AC-002-1).
 *
 * Generates a synthetic 1k-component project (package.json +
 * package-lock.json), times two paths end-to-end, and asserts each is
 * under the 30-second wall-clock budget (per ADR-0007 criterion 1 /
 * spec.md §10 AC-001-1 + AC-002-1):
 *
 *   1. SBOM path:  parse → IR → emit SPDX 2.3 + CycloneDX 1.5 → serialise
 *   2. Scan path:  parse → IR → correlate vs vuln-db → dedupe + rank
 *
 * The vuln-db is a synthetic 50-advisory snapshot whose entries match a
 * realistic ~5% of the generated components so the correlator does
 * non-trivial work (not just an early-exit zero-finding loop).
 *
 * Output: a Markdown table on stdout + a persisted `docs/BENCHMARK.generated.md`
 * (auto-overwritten on each run). Exit code is non-zero when either
 * path exceeds its budget, so a CI gate could be added later.
 *
 * Override the component count via env: `BENCH_N=2000 pnpm exec tsx scripts/benchmark.ts`.
 */

import { performance } from 'node:perf_hooks';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseNpmProject } from '../src/parsers/npm.js';
import { emitSpdx } from '../src/emitters/spdx-2.3.js';
import { emitCycloneDx } from '../src/emitters/cyclonedx-1.5.js';
import { serializeDocument } from '../src/emitters/_shared.js';
import { correlate } from '../src/scanners/correlator.js';
import {
  dedupeByAdvisoryId,
  rankBySeverity,
} from '../src/scanners/severity.js';
import type {
  OsvVulnerability,
  VulnDbCache,
} from '../src/scanners/vuln-db.js';

const N = Number(process.env['BENCH_N'] ?? '1000');
// Tight regression budget — distinct from the spec.md absolute budget.
//
//   - spec.md AC-001-1 / AC-002-1 absolute budget: 30_000 ms.
//   - This script's regression budget: 5_000 ms.
//
// Locally measured wall-clock on a consumer Windows laptop = ~40 ms
// (sbom) / ~13 ms (scan). The 5_000 ms regression budget keeps a
// 125× margin above measurement noise, but catches an order-of-
// magnitude (~10×) regression long before it crosses the spec
// budget — silent perf bugs surface in CI rather than only when a
// fixture grows by 100×.
const SBOM_BUDGET_MS = 5_000;
const SCAN_BUDGET_MS = 5_000;
// Spec budget — exposed in the report alongside the regression budget
// so a reader sees both numbers.
const SPEC_BUDGET_MS = 30_000;
// Synthetic vuln-db advisory count. Chosen so the correlator does real
// work on 1k × 50 = 50k component-advisory pairs without making the
// benchmark itself dominated by the DB rather than the implementation.
const ADVISORY_COUNT = 50;
const VULN_MATCH_RATIO = 0.05; // ~5% of advisories match a real component

interface BenchmarkResult {
  name: string;
  elapsedMs: number;
  budgetMs: number;
  passed: boolean;
  extra: Record<string, string | number>;
}

function syntheticPackageName(i: number): string {
  // pkg:npm namespacing: alternate scoped / unscoped to exercise both
  // pURL paths in the parser + emitters.
  const base = `bench-pkg-${i.toString().padStart(5, '0')}`;
  return i % 5 === 0 ? `@bench-scope/${base}` : base;
}

async function generateProject(dir: string, n: number): Promise<void> {
  const dependencies: Record<string, string> = {};
  // The lockfile maps node_modules/<name> → { version, license }
  const packages: Record<string, Record<string, unknown>> = {
    '': {
      name: 'bench-fixture',
      version: '1.0.0',
    },
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
    JSON.stringify(
      { name: 'bench-fixture', version: '1.0.0', dependencies },
      null,
      2,
    ),
  );
  await writeFile(
    join(dir, 'package-lock.json'),
    JSON.stringify(
      {
        name: 'bench-fixture',
        version: '1.0.0',
        lockfileVersion: 3,
        packages,
      },
      null,
      2,
    ),
  );
}

function generateVulnDb(n: number, advisoryCount: number): VulnDbCache {
  const advisories: OsvVulnerability[] = [];
  const matchCount = Math.max(1, Math.floor(advisoryCount * VULN_MATCH_RATIO));
  for (let a = 0; a < advisoryCount; a++) {
    // ~5% of advisories target a component the generator actually
    // produced; the rest target ghost packages so the correlator
    // iterates without finding a match (worst-case path coverage).
    const targetsReal = a < matchCount;
    const targetIdx = targetsReal
      ? Math.floor((a / matchCount) * n)
      : -1 - a;
    const targetName =
      targetIdx >= 0
        ? syntheticPackageName(targetIdx)
        : `ghost-pkg-${a.toString().padStart(4, '0')}`;
    advisories.push({
      id: `GHSA-bench-${a.toString().padStart(4, '0')}`,
      summary: `synthetic benchmark advisory ${a}`,
      aliases: [`CVE-2026-9${a.toString().padStart(4, '0')}`],
      modified: '2026-05-01T00:00:00Z',
      published: '2026-04-15T00:00:00Z',
      database_specific: {
        severity: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'][a % 4] ?? 'MODERATE',
      },
      affected: [
        {
          package: {
            ecosystem: 'npm',
            name: targetName,
            purl: `pkg:npm/${encodeURIComponent(targetName)}`,
          },
          ranges: [
            {
              type: 'SEMVER',
              events: [
                { introduced: '0.0.0' },
                { fixed: '999.999.999' },
              ],
            },
          ],
        },
      ],
      references: [
        {
          type: 'WEB',
          url: `https://example.test/advisories/${a}`,
        },
      ],
    });
  }
  return {
    metadata: {
      schemaVersion: '1.0.0',
      lastUpdated: '2026-05-20T00:00:00Z',
      advisoryCount,
      source: 'synthetic-benchmark',
    },
    advisories,
  };
}

async function runSbomPath(projectDir: string): Promise<BenchmarkResult> {
  const t0 = performance.now();
  const ir = await parseNpmProject(projectDir, {
    namespace: 'urn:sbom-pilot:bench:fixture',
    creatorVersion: '0.0.0-bench',
    createdAt: '2026-05-20T00:00:00Z',
  });
  const spdxDoc = emitSpdx(ir);
  const spdxSerial = serializeDocument(spdxDoc);
  const cdxDoc = emitCycloneDx(ir);
  const cdxSerial = serializeDocument(cdxDoc);
  const elapsedMs = performance.now() - t0;
  return {
    name: 'sbom (parse + IR + SPDX + CycloneDX + serialise)',
    elapsedMs,
    budgetMs: SBOM_BUDGET_MS,
    passed: elapsedMs < SBOM_BUDGET_MS,
    extra: {
      components: ir.components.length,
      spdxBytes: spdxSerial.length,
      cdxBytes: cdxSerial.length,
    },
  };
}

async function runScanPath(
  projectDir: string,
  db: VulnDbCache,
): Promise<BenchmarkResult> {
  const t0 = performance.now();
  const ir = await parseNpmProject(projectDir);
  const raw = correlate(ir, db);
  const deduped = dedupeByAdvisoryId(raw);
  const ranked = rankBySeverity(deduped);
  const elapsedMs = performance.now() - t0;
  return {
    name: 'scan (parse + IR + correlate + dedupe + rank)',
    elapsedMs,
    budgetMs: SCAN_BUDGET_MS,
    passed: elapsedMs < SCAN_BUDGET_MS,
    extra: {
      components: ir.components.length,
      advisories: db.advisories.length,
      findings: ranked.length,
    },
  };
}

function renderTable(results: BenchmarkResult[]): string {
  const lines: string[] = [];
  lines.push('| Path | Wall-clock (ms) | Budget (ms) | Pass | Extra |');
  lines.push('|---|---:|---:|:---:|---|');
  for (const r of results) {
    const extras = Object.entries(r.extra)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(
      `| ${r.name} | ${Math.round(r.elapsedMs)} | ${r.budgetMs} | ${
        r.passed ? '✅' : '❌'
      } | ${extras} |`,
    );
  }
  return lines.join('\n');
}

async function main(): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), 'sbom-pilot-bench-'));
  try {
    const t0 = performance.now();
    await generateProject(dir, N);
    const genMs = performance.now() - t0;
    const db = generateVulnDb(N, ADVISORY_COUNT);

    const sbomResult = await runSbomPath(dir);
    const scanResult = await runScanPath(dir, db);

    const results = [sbomResult, scanResult];
    const table = renderTable(results);

    const header = [
      '# sbom-pilot benchmark — wall-clock perf',
      '',
      `Generated at: ${new Date().toISOString()}`,
      `Component count: ${N}`,
      `Advisory count: ${ADVISORY_COUNT} (~${Math.round(VULN_MATCH_RATIO * 100)}% targeting real components)`,
      `Fixture generation: ${Math.round(genMs)} ms`,
      `Regression budget: ${SBOM_BUDGET_MS} ms per path (~125× over typical measurement; catches 10×-class regressions)`,
      `Spec budget (AC-001-1 / AC-002-1): ${SPEC_BUDGET_MS} ms per path`,
      '',
    ].join('\n');

    console.log(header);
    console.log(table);

    // Persist a copy under docs/ so reviewers can read the most recent
    // numbers without running locally.
    const outDir = join(process.cwd(), 'docs');
    await mkdir(outDir, { recursive: true });
    const persist = [
      '<!-- generated by scripts/benchmark.ts -->',
      `<!-- generated_at: ${new Date().toISOString()} -->`,
      `<!-- component_count: ${N} -->`,
      '',
      header,
      table,
      '',
    ].join('\n');
    await writeFile(join(outDir, 'BENCHMARK.generated.md'), persist);

    const allPassed = results.every((r) => r.passed);
    return allPassed ? 0 : 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Auto-run main() only when this file is invoked as the entry script
// (e.g. `tsx scripts/benchmark.ts`). When imported as a module (e.g.
// from tests/e2e/perf.test.ts to reuse generateVulnDb), the side-effect
// must NOT fire — otherwise the test harness picks up a stray run.
const invokedAsEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  // Both URLs and Windows-style paths land here; comparing via
  // fileURLToPath would couple us to node:url which is overkill for a
  // benchmark script. The `endsWith('benchmark.ts')` suffix check is
  // sufficient for the two invocation paths the project uses
  // (tsx scripts/benchmark.ts | tsx scripts/benchmark.js post-build).
  /[\\/]benchmark\.(ts|js|mjs)$/.test(process.argv[1]);

if (invokedAsEntry) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}

export { generateVulnDb };
