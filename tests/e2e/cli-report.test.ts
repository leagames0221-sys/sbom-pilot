/**
 * End-to-end tests for `sbom-pilot report` (T-31).
 *
 * Spec mapping: AC-003-1..8, AC-005-1, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCli, type CliRunOptions } from '../../src/cli/index.js';
import {
  EX_DATAERR,
  EX_OK,
  EX_USAGE,
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

describe('sbom-pilot report — --standard required', () => {
  it('exits EX_USAGE + lists the 4 standards when --standard is omitted', async () => {
    const out = await runCaptured(['report', npmFixture]);
    expect(out.exitCode).toBe(EX_USAGE);
    const msg = out.stderr.join('\n');
    expect(msg).toContain('appi-26-2');
    expect(msg).toContain('meti-sbom-v2');
    expect(msg).toContain('ntia');
    expect(msg).toContain('eu-cra');
  });

  it('exits EX_USAGE on an unknown --standard', async () => {
    const out = await runCaptured([
      'report',
      npmFixture,
      '--standard',
      'bogus',
    ]);
    expect(out.exitCode).toBe(EX_USAGE);
    expect(out.stderr.join('\n')).toMatch(/unknown --standard/);
  });
});

describe('sbom-pilot report --standard appi-26-2', () => {
  it('renders the Japanese incident report and exits EX_OK', async () => {
    const out = await runCaptured([
      'report',
      npmFixture,
      '--standard',
      'appi-26-2',
      '--vuln-db',
      vulnDbPath,
    ]);
    expect(out.exitCode).toBe(EX_OK);
    const body = out.stdout.join('\n');
    expect(body).toContain('個人情報保護法 第26条の2 報告書');
    expect(body).toContain('lodash');
  });

  it('proceeds with empty findings when vuln-db is not loadable (advisory)', async () => {
    const out = await runCaptured([
      'report',
      npmFixture,
      '--standard',
      'appi-26-2',
      '--vuln-db',
      '/no/such/cache',
    ]);
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stderr.join('\n')).toMatch(/vuln-db not loadable/);
  });
});

describe('sbom-pilot report --standard meti-sbom-v2 / ntia', () => {
  it('renders the METI report in Japanese', async () => {
    const out = await runCaptured([
      'report',
      npmFixture,
      '--standard',
      'meti-sbom-v2',
    ]);
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stdout.join('\n')).toContain(
      'METI SBOM 導入手引き v2.0 最小要件 検証レポート',
    );
  });

  it('renders the NTIA report in English', async () => {
    const out = await runCaptured([
      'report',
      npmFixture,
      '--standard',
      'ntia',
    ]);
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stdout.join('\n')).toContain(
      'NTIA Minimum Elements compliance report',
    );
  });
});

describe('sbom-pilot report --standard eu-cra', () => {
  it('renders the EU CRA Annex I checklist on a default (no sbom-format) run', async () => {
    const out = await runCaptured([
      'report',
      npmFixture,
      '--standard',
      'eu-cra',
    ]);
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stdout.join('\n')).toContain(
      'EU Cyber Resilience Act — Annex I §1 checklist',
    );
  });

  it('exits EX_USAGE when --sbom-format spdx-2.3 is passed (CycloneDX-only constraint)', async () => {
    const out = await runCaptured([
      'report',
      npmFixture,
      '--standard',
      'eu-cra',
      '--sbom-format',
      'spdx-2.3',
    ]);
    expect(out.exitCode).toBe(EX_USAGE);
    expect(out.stderr.join('\n')).toMatch(/cyclonedx/i);
  });
});

describe('sbom-pilot report — error paths', () => {
  it('exits EX_DATAERR on an empty project directory', async () => {
    const { tmpdir } = await import('node:os');
    const { promises: fs } = await import('node:fs');
    const { randomBytes } = await import('node:crypto');
    const empty = join(tmpdir(), `report-empty-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(empty, { recursive: true });
    try {
      const out = await runCaptured(['report', empty, '--standard', 'ntia']);
      expect(out.exitCode).toBe(EX_DATAERR);
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });
});
