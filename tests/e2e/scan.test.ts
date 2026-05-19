/**
 * End-to-end scan test (T-21 verify clause).
 *
 *   project-dir → dispatchParser → IR → correlate(IR, db)
 *               → severity.rankBySeverity → emitSarif → schema validate
 *
 * Pipes all five Layer-1..Layer-4 modules together against the
 * npm-tiny + seed-vuln-db fixtures and asserts the end-to-end result
 * is a SARIF 2.1.0 document that passes the vendored schema and
 * contains the 3 expected findings (lodash / express / chalk).
 *
 * Spec mapping: AC-001-1, AC-002-1, AC-002-4, AC-002-7,
 * ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dispatchParser } from '../../src/parsers/index.js';
import { loadVulnDb } from '../../src/scanners/vuln-db.js';
import { correlate } from '../../src/scanners/correlator.js';
import {
  dedupeByAdvisoryId,
  rankBySeverity,
  shouldFailOn,
} from '../../src/scanners/severity.js';
import { emitSarif } from '../../src/emitters/sarif-2.1.0.js';
import { validate } from '../../src/schemas/validate.js';
import { serializeDocument } from '../../src/emitters/_shared.js';

const here = dirname(fileURLToPath(import.meta.url));
const npmFixturePath = join(
  here,
  '..',
  'fixtures',
  'projects',
  'npm-tiny',
);
const vulnDbPath = join(
  here,
  '..',
  'fixtures',
  'vuln-db-seed',
  'vuln-db.json',
);

async function runScan() {
  const ir = await dispatchParser(npmFixturePath, {
    namespace: 'urn:sbom-pilot:test:e2e-scan',
    createdAt: '2026-05-20T00:00:00Z',
    creatorVersion: '0.0.0-test',
  });
  const db = await loadVulnDb(vulnDbPath);
  const raw = correlate(ir, db);
  const deduped = dedupeByAdvisoryId(raw);
  const ranked = rankBySeverity(deduped);
  const sarif = emitSarif(ranked, { creatorVersion: '0.0.0-test' });
  return { ir, raw, deduped, ranked, sarif };
}

describe('scan e2e — project-dir → IR → scan → SARIF', () => {
  it('routes npm-tiny through the parser dispatcher and emits 6 IR components', async () => {
    const { ir } = await runScan();
    expect(ir.components).toHaveLength(6);
  });

  it('correlates the 5 manifest deps against the seed vuln-db → 3 raw findings', async () => {
    const { raw } = await runScan();
    expect(raw).toHaveLength(3);
    expect(raw.map((f) => f.componentName).sort()).toEqual([
      'chalk',
      'express',
      'lodash',
    ]);
  });

  it('passes through severity.dedupeByAdvisoryId unchanged (no duplicate ids)', async () => {
    const { raw, deduped } = await runScan();
    expect(deduped).toHaveLength(raw.length);
  });

  it('ranks findings most-severe-first (HIGH → MODERATE → LOW)', async () => {
    const { ranked } = await runScan();
    expect(ranked.map((f) => f.severity)).toEqual([
      'HIGH',
      'MODERATE',
      'LOW',
    ]);
  });

  it('emits a SARIF 2.1.0 document that passes the vendored schema', async () => {
    const { sarif } = await runScan();
    const result = validate('sarif-2.1.0', sarif);
    expect.soft(result.errors, 'unexpected SARIF schema errors').toBeNull();
    expect(result.ok).toBe(true);
  });

  it('embeds one rule per finding in tool.driver.rules', async () => {
    const { sarif } = await runScan();
    const run = (sarif['runs'] as Array<{
      tool: { driver: { rules: unknown[] } };
      results: unknown[];
    }>)[0]!;
    expect(run.tool.driver.rules).toHaveLength(3);
    expect(run.results).toHaveLength(3);
  });

  it('serialises the SARIF deterministically across two runs', async () => {
    const first = await runScan();
    const second = await runScan();
    expect(serializeDocument(first.sarif)).toBe(
      serializeDocument(second.sarif),
    );
  });

  it('triggers --fail-on HIGH because lodash@4.17.21 is HIGH severity', async () => {
    const { ranked } = await runScan();
    expect(shouldFailOn(ranked, ['HIGH'])).toBe(true);
  });

  it('does not trigger --fail-on CRITICAL (no CRITICAL findings in seed)', async () => {
    const { ranked } = await runScan();
    expect(shouldFailOn(ranked, ['CRITICAL'])).toBe(false);
  });
});
