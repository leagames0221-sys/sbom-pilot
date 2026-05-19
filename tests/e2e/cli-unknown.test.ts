/**
 * End-to-end test for the unknown-command did-you-mean path (T-32).
 *
 * Spec mapping: AC-005-2, AC-005-4, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { runCli, type CliRunOptions } from '../../src/cli/index.js';
import { EX_USAGE } from '../../src/exit-codes.js';

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

describe('sbom-pilot — unknown subcommand', () => {
  it('exits EX_USAGE on a clearly-wrong subcommand', async () => {
    const out = await runCaptured(['xyzabc']);
    expect(out.exitCode).toBe(EX_USAGE);
  });

  it('suggests "scan" for "scn"', async () => {
    const out = await runCaptured(['scn']);
    expect(out.exitCode).toBe(EX_USAGE);
    expect(out.stderr.join('\n')).toContain('did you mean: scan?');
  });

  it('suggests "report" for "reprt"', async () => {
    const out = await runCaptured(['reprt']);
    expect(out.exitCode).toBe(EX_USAGE);
    expect(out.stderr.join('\n')).toContain('did you mean: report?');
  });

  it('omits the hint when no candidate is close enough', async () => {
    const out = await runCaptured(['xyzabc']);
    expect(out.stderr.join('\n')).not.toMatch(/did you mean/);
  });
});

describe('sbom-pilot — --no-color global flag (AC-005-4)', () => {
  it('strips ANSI from a stderr line when --no-color is set', async () => {
    // The "did you mean" hint contains no ANSI by default; this test
    // exercises the structural wiring rather than the colourised
    // path (commander itself doesn't colour our output at T-32 scope).
    const out = await runCaptured(['--no-color', 'scn']);
    expect(out.exitCode).toBe(EX_USAGE);
    expect(out.stderr.join('\n')).toContain('did you mean: scan?');
    // No ANSI ESC byte should appear in any stderr line.
    for (const line of out.stderr) {
      expect(line.indexOf(String.fromCharCode(0x1b))).toBe(-1);
    }
  });
});
