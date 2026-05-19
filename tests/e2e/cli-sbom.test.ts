/**
 * End-to-end test for `sbom-pilot sbom <project-dir>` (T-30).
 *
 * Spec mapping: AC-001-1..8, ADR-0005, ADR-0006.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { runCli, type CliRunOptions } from '../../src/cli/index.js';
import { validate } from '../../src/schemas/validate.js';
import { EX_OK, EX_DATAERR, EX_USAGE } from '../../src/exit-codes.js';

const here = dirname(fileURLToPath(import.meta.url));
const npmFixture = join(here, '..', 'fixtures', 'projects', 'npm-tiny');

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

describe('sbom-pilot sbom — happy path', () => {
  it('default format = SPDX 2.3 → schema-valid JSON to stdout', async () => {
    const out = await runCaptured(['sbom', npmFixture]);
    expect(out.exitCode).toBe(EX_OK);
    const doc = JSON.parse(out.stdout.join('\n'));
    expect(doc.spdxVersion).toBe('SPDX-2.3');
    expect(validate('spdx-2.3', doc).ok).toBe(true);
  });

  it('--format cyclonedx → schema-valid CycloneDX 1.5 JSON', async () => {
    const out = await runCaptured(['sbom', npmFixture, '--format', 'cyclonedx']);
    expect(out.exitCode).toBe(EX_OK);
    const doc = JSON.parse(out.stdout.join('\n'));
    expect(doc.bomFormat).toBe('CycloneDX');
    expect(validate('cyclonedx-1.5', doc).ok).toBe(true);
  });

  it('--format spdx-2.3 long-form alias resolves to the spdx emitter', async () => {
    const out = await runCaptured(['sbom', npmFixture, '--format', 'spdx-2.3']);
    expect(out.exitCode).toBe(EX_OK);
    const doc = JSON.parse(out.stdout.join('\n'));
    expect(doc.spdxVersion).toBe('SPDX-2.3');
  });
});

describe('sbom-pilot sbom — --output (atomic write)', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `sbom-cli-out-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('writes SPDX to <path> atomically when --output is provided', async () => {
    const target = join(workDir, 'sbom.json');
    const out = await runCaptured(['sbom', npmFixture, '--output', target]);
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stdout).toEqual([]);
    const onDisk = await fs.readFile(target, 'utf8');
    const doc = JSON.parse(onDisk);
    expect(doc.spdxVersion).toBe('SPDX-2.3');
  });
});

describe('sbom-pilot sbom — error paths', () => {
  it('exits EX_USAGE on unknown --format', async () => {
    const out = await runCaptured(['sbom', npmFixture, '--format', 'bogus']);
    expect(out.exitCode).toBe(EX_USAGE);
    expect(out.stderr.join('\n')).toMatch(/unknown --format/);
  });

  it('exits EX_DATAERR on a project directory with no recognised manifest', async () => {
    const empty = join(tmpdir(), `sbom-empty-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(empty, { recursive: true });
    try {
      const out = await runCaptured(['sbom', empty]);
      expect(out.exitCode).toBe(EX_DATAERR);
      expect(out.stderr.join('\n')).toMatch(/No supported manifest/);
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });
});
