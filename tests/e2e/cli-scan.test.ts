/**
 * End-to-end test for `sbom-pilot scan <project-dir>` (T-30).
 *
 * Spec mapping: AC-002-1..7, ADR-0005, ADR-0006.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { runCli, type CliRunOptions } from '../../src/cli/index.js';
import { validate } from '../../src/schemas/validate.js';
import {
  EX_DATAERR,
  EX_OK,
  EX_TEMPFAIL,
} from '../../src/exit-codes.js';

const here = dirname(fileURLToPath(import.meta.url));
const npmFixture = join(here, '..', 'fixtures', 'projects', 'npm-tiny');
const vulnDbPath = join(here, '..', 'fixtures', 'vuln-db-seed', 'vuln-db.json');

interface CapturedRun {
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}

async function runCaptured(argv: ReadonlyArray<string>): Promise<CapturedRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;
  const opts: CliRunOptions = {
    argv,
    stdout: (s: string) => stdout.push(s),
    stderr: (s: string) => stderr.push(s),
    exit: (c: number) => {
      exitCode = c;
    },
  };
  await runCli(opts);
  return { stdout, stderr, exitCode };
}

describe('sbom-pilot scan — happy path', () => {
  it('produces schema-valid SARIF 2.1.0 to stdout', async () => {
    const out = await runCaptured(['scan', npmFixture, '--vuln-db', vulnDbPath]);
    expect(out.exitCode).toBe(EX_OK);
    const sarif = JSON.parse(out.stdout.join('\n'));
    expect(sarif.version).toBe('2.1.0');
    expect(validate('sarif-2.1.0', sarif).ok).toBe(true);
  });

  it('emits the stderr summary with per-severity counts', async () => {
    const out = await runCaptured(['scan', npmFixture, '--vuln-db', vulnDbPath]);
    const summary = out.stderr.join('\n');
    expect(summary).toContain('sbom-pilot scan summary');
    // npm-tiny × seed = 1 HIGH (lodash) + 1 MODERATE (express) + 1 LOW (chalk)
    expect(summary).toContain('HIGH 1');
    expect(summary).toContain('MODERATE 1');
    expect(summary).toContain('LOW 1');
  });

  it('emits exactly 3 results across 3 rule entries (lodash / express / chalk)', async () => {
    const out = await runCaptured(['scan', npmFixture, '--vuln-db', vulnDbPath]);
    const sarif = JSON.parse(out.stdout.join('\n'));
    const run = sarif.runs[0];
    expect(run.results).toHaveLength(3);
    expect(run.tool.driver.rules).toHaveLength(3);
  });
});

describe('sbom-pilot scan — --output (atomic write)', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `sbom-scan-out-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('writes SARIF to <path> atomically when --output is provided', async () => {
    const target = join(workDir, 'scan.sarif.json');
    const out = await runCaptured([
      'scan',
      npmFixture,
      '--vuln-db',
      vulnDbPath,
      '--output',
      target,
    ]);
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stdout).toEqual([]);
    const onDisk = await fs.readFile(target, 'utf8');
    const sarif = JSON.parse(onDisk);
    expect(sarif.version).toBe('2.1.0');
  });
});

describe('sbom-pilot scan — --fail-on policy', () => {
  it('exits EX_TEMPFAIL when --fail-on HIGH is triggered by a HIGH finding', async () => {
    const out = await runCaptured([
      'scan',
      npmFixture,
      '--vuln-db',
      vulnDbPath,
      '--fail-on',
      'high',
    ]);
    expect(out.exitCode).toBe(EX_TEMPFAIL);
  });

  it('exits EX_OK when --fail-on CRITICAL has no matching findings (seed has no CRITICAL)', async () => {
    const out = await runCaptured([
      'scan',
      npmFixture,
      '--vuln-db',
      vulnDbPath,
      '--fail-on',
      'critical',
    ]);
    expect(out.exitCode).toBe(EX_OK);
  });

  it('accepts a comma-separated --fail-on list', async () => {
    const out = await runCaptured([
      'scan',
      npmFixture,
      '--vuln-db',
      vulnDbPath,
      '--fail-on',
      'critical,high',
    ]);
    expect(out.exitCode).toBe(EX_TEMPFAIL);
  });
});

describe('sbom-pilot scan — error paths', () => {
  it('exits EX_DATAERR when vuln-db is missing', async () => {
    const out = await runCaptured([
      'scan',
      npmFixture,
      '--vuln-db',
      '/no/such/cache.json',
    ]);
    expect(out.exitCode).toBe(EX_DATAERR);
    expect(out.stderr.join('\n')).toMatch(/cannot load vuln-db/);
  });
});
