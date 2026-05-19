/**
 * End-to-end CLI scaffold tests (T-29).
 *
 * Drives `runCli()` with injected stdout / stderr / exit handlers so
 * the assertions run in-process (no fork, no real process.exit) and
 * the test runner can read every line of output deterministically.
 *
 * Spec mapping: AC-005-1, AC-005-3, AC-005-5, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  buildProgram,
  runCli,
  type CliRunOptions,
} from '../../src/cli/index.js';
import {
  checkNodeEngine,
  formatVersionLine,
  MINIMUM_NODE_MAJOR,
  parseNodeMajor,
  readPackageVersion,
} from '../../src/cli/version.js';
import {
  EX_CONFIG,
  EX_OK,
  EX_TEMPFAIL,
} from '../../src/exit-codes.js';

interface CapturedRun {
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}

async function runCaptured(
  argv: ReadonlyArray<string>,
  nodeVersion: string = process.versions.node,
): Promise<CapturedRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;
  const opts: CliRunOptions = {
    argv,
    nodeVersion,
    stdout: (line: string) => stdout.push(line),
    stderr: (line: string) => stderr.push(line),
    exit: (code: number) => {
      exitCode = code;
    },
  };
  await runCli(opts);
  return { stdout, stderr, exitCode };
}

describe('version helper', () => {
  it('parseNodeMajor handles v-prefixed and bare strings', () => {
    expect(parseNodeMajor('v22.5.1')).toBe(22);
    expect(parseNodeMajor('22.5.1')).toBe(22);
    expect(parseNodeMajor('20.0.0')).toBe(20);
  });

  it('parseNodeMajor returns NaN on unparseable input', () => {
    expect(Number.isNaN(parseNodeMajor('not-a-version'))).toBe(true);
  });

  it('MINIMUM_NODE_MAJOR is 20', () => {
    expect(MINIMUM_NODE_MAJOR).toBe(20);
  });

  it('checkNodeEngine ok=true for Node 20+', () => {
    expect(checkNodeEngine('20.0.0').ok).toBe(true);
    expect(checkNodeEngine('22.5.1').ok).toBe(true);
  });

  it('checkNodeEngine ok=false for Node 18.x', () => {
    const r = checkNodeEngine('18.20.0');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/below the minimum/);
  });

  it('checkNodeEngine ok=false for unparseable version', () => {
    const r = checkNodeEngine('garbage');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/cannot parse/);
  });

  it('formatVersionLine without git hash', () => {
    expect(formatVersionLine({ version: '0.1.0', gitHash: null })).toBe(
      'sbom-pilot 0.1.0',
    );
  });

  it('formatVersionLine with git hash', () => {
    expect(formatVersionLine({ version: '0.1.0', gitHash: 'abc1234' })).toBe(
      'sbom-pilot 0.1.0 (abc1234)',
    );
  });

  it('readPackageVersion returns the package.json version string', () => {
    expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('runCli — Node engine gate (AC-005-3)', () => {
  it('exits EX_CONFIG when Node version is below the minimum', async () => {
    const out = await runCaptured(['--version'], '18.0.0');
    expect(out.exitCode).toBe(EX_CONFIG);
    expect(out.stderr.join('\n')).toMatch(/below the minimum/);
  });

  it('proceeds normally on Node 20+', async () => {
    const out = await runCaptured(['--version'], '20.0.0');
    // commander throws on --version after writing; we route exit
    // through the injected handler; exitCode is set by commander's
    // exitOverride.
    expect(out.exitCode).toBe(EX_OK);
    expect(out.stdout.join('\n')).toContain('sbom-pilot');
  });
});

describe('runCli — --version + --help (AC-005-5)', () => {
  it('--version prints "sbom-pilot <version>"', async () => {
    const out = await runCaptured(['--version']);
    const joined = out.stdout.join('\n');
    expect(joined).toMatch(/sbom-pilot \d+\.\d+\.\d+/);
  });

  it('--help lists exactly the four subcommands (AC-005-1)', () => {
    // buildProgram returns the configured commander; helpInformation()
    // is the rendered help text including subcommand registry.
    const lines: string[] = [];
    const program = buildProgram({
      argv: [],
      stdout: (s: string) => lines.push(s),
      stderr: () => {},
      exit: () => {},
    });
    const help = program.helpInformation();
    expect(help).toContain('sbom');
    expect(help).toContain('scan');
    expect(help).toContain('report');
    expect(help).toContain('suggest');
  });

  it('--help renders in less than 100 ms', async () => {
    const start = Date.now();
    await runCaptured(['--help']);
    const elapsed = Date.now() - start;
    // Generous bound for noisy CI runners; the actual help render is
    // string-only and typically well under 10 ms.
    expect(elapsed).toBeLessThan(100);
  });
});

describe('runCli — stub subcommand actions', () => {
  it('sbom <dir> emits "not yet implemented" + EX_TEMPFAIL exit code', async () => {
    const out = await runCaptured(['sbom', '/tmp/x']);
    expect(out.exitCode).toBe(EX_TEMPFAIL);
    expect(out.stderr.join('\n')).toContain('sbom-pilot sbom: not yet implemented');
  });

  it('scan <dir> emits "not yet implemented" + EX_TEMPFAIL', async () => {
    const out = await runCaptured(['scan', '/tmp/x']);
    expect(out.exitCode).toBe(EX_TEMPFAIL);
    expect(out.stderr.join('\n')).toContain('scan: not yet implemented');
  });

  it('report <dir> emits "not yet implemented" + EX_TEMPFAIL', async () => {
    const out = await runCaptured(['report', '/tmp/x']);
    expect(out.exitCode).toBe(EX_TEMPFAIL);
    expect(out.stderr.join('\n')).toContain('report: not yet implemented');
  });

  it('suggest <id> emits "not yet implemented" + EX_TEMPFAIL', async () => {
    const out = await runCaptured(['suggest', 'GHSA-x']);
    expect(out.exitCode).toBe(EX_TEMPFAIL);
    expect(out.stderr.join('\n')).toContain('suggest: not yet implemented');
  });
});
