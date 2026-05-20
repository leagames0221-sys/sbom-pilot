/**
 * Negative-test for the ADR-0006 forbidden-edge lint.
 *
 * Per tasks.md T-35: "negative-test fixture imports a forbidden edge
 * (parser → emitter) → lint exits non-zero with the literal forbidden-
 * edge name."
 *
 * Strategy: write a synthetic fixture under a tmp dir with a literal
 * `import` from a `parsers/` file targeting an `emitters/` file. Invoke
 * the `depcruise` CLI binary (via execFileSync) against the fixture
 * using an inline forbidden-rule set. Assert that:
 *
 *   1. exit code is non-zero
 *   2. stdout/stderr contains the literal rule name `no-parsers-to-emitters`
 *
 * The CLI invocation is used (rather than the programmatic `cruise()`
 * API) because the programmatic rule-application path varies across
 * dependency-cruiser versions; the CLI surface is the stable contract
 * the project actually relies on in CI.
 */
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const projectRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

// Resolve the dependency-cruiser JS entry directly so we invoke it
// via `node <entry>`. This sidesteps the Windows .cmd shim quirk that
// trips up child_process.execFile when given a `.cmd` shebang.
const depcruiseEntry = join(
  projectRoot,
  'node_modules',
  'dependency-cruiser',
  'bin',
  'dependency-cruise.mjs',
);

describe('dependency-direction lint (ADR-0006 negative test)', () => {
  it('flags a parser → emitter import with rule name no-parsers-to-emitters', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sbom-pilot-lint-neg-'));
    try {
      const parserDir = join(dir, 'parsers');
      const emitterDir = join(dir, 'emitters');
      await mkdir(parserDir, { recursive: true });
      await mkdir(emitterDir, { recursive: true });
      await writeFile(
        join(emitterDir, 'fake-emitter.js'),
        'export const sink = 1;\n',
      );
      await writeFile(
        join(parserDir, 'bad-parser.js'),
        // The forbidden edge — a parser file importing from an emitter.
        "import { sink } from '../emitters/fake-emitter.js';\nexport const use = sink;\n",
      );

      // Write a minimal config exposing only the rule under test, so
      // the negative fixture is not also held to the full project rule
      // set (which would for instance flag missing tsconfig).
      const cfgPath = join(dir, '.dependency-cruiser.cjs');
      await writeFile(
        cfgPath,
        `module.exports = {
  forbidden: [
    {
      name: 'no-parsers-to-emitters',
      severity: 'error',
      from: { path: 'parsers' },
      to: { path: 'emitters' },
    },
  ],
  options: { doNotFollow: { path: 'node_modules' } },
};
`,
      );

      // Invoke depcruise via `node <entry.mjs>` directly so this runs
      // cross-platform without relying on the .cmd shim that trips up
      // child_process on Windows. depcruise exits with non-zero when
      // error-severity violations are present.
      const proc = spawnSync(
        process.execPath,
        [depcruiseEntry, '--config', cfgPath, parserDir, emitterDir],
        { encoding: 'utf8' },
      );
      const exitCode = proc.status ?? 1;
      const output = (proc.stdout ?? '') + (proc.stderr ?? '');

      expect(exitCode).toBeGreaterThan(0);
      expect(output).toContain('no-parsers-to-emitters');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
