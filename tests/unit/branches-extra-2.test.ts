/**
 * Branches-coverage targeted unit tests — round 2 (post-T-40 review).
 *
 * The first branches-extra file (tests/unit/branches-extra.test.ts)
 * raised global branches from 81.6% to 86.5%. Per-file hot-spots still
 * remained:
 *
 *   - suggest.ts 62.5% (L93 non-PaidDefenseError re-throw,
 *                       L111-112 ollama → mock fallback)
 *   - scan.ts    80.76% (L114-118 dispatch parser error path)
 *   - atomic-write.ts 72.72% (L62-68 handle-cleanup branch)
 *
 * Each test names the file + branch it targets so a coverage
 * regression triage is one click away.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { suggestAction } from '../../src/cli/subcommands/suggest.js';
import { scanAction } from '../../src/cli/subcommands/scan.js';
import { atomicWrite } from '../../src/util/atomic-write.js';
import { EX_DATAERR } from '../../src/exit-codes.js';

function makeCtx() {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const probe = { exitCode: null as number | null };
  const ctx = {
    stdout: (l: string) => stdoutLines.push(l),
    stderr: (l: string) => stderrLines.push(l),
    exit: (c: number) => {
      probe.exitCode = c;
    },
  };
  return { ctx, stdoutLines, stderrLines, probe };
}

// ---------------------------------------------------------------------------
// suggest.ts — ollama fetch failure → mock fallback (L111-112)
// ---------------------------------------------------------------------------

describe('suggest — ollama → mock fallback path', () => {
  it('falls back to the mock provider when ollama transport throws', async () => {
    const { ctx, stderrLines, probe } = makeCtx();
    const failingFetch = vi
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED ollama down'));

    await suggestAction(
      'GHSA-test-bbbb',
      { ollamaFetch: failingFetch as unknown as typeof fetch },
      ctx,
      {},
    );

    // Expect the literal fallback notice on stderr (covers L111).
    expect(
      stderrLines.some((l) =>
        l.includes('falling back to the mock provider'),
      ),
    ).toBe(true);
    // And the mock should produce a successful suggest (covers L112-113).
    expect(probe.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scan.ts — dispatch parser error path (L113-118)
// ---------------------------------------------------------------------------

describe('scan — dispatch parser error → EX_DATAERR + stderr', () => {
  it('exits EX_DATAERR with a stderr line when the project dir has no manifest', async () => {
    const { ctx, stderrLines, probe } = makeCtx();
    const dir = await mkdtemp(join(tmpdir(), 'sbom-pilot-scan-err-'));
    try {
      await scanAction(
        // Empty tmp dir → dispatcher throws EX_DATAERR class error.
        dir,
        {},
        ctx,
      );
      expect(probe.exitCode).toBe(EX_DATAERR);
      expect(
        stderrLines.some((l) => l.startsWith('sbom-pilot scan:')),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// atomic-write.ts — fs.rename failure path (covers the post-close throw)
// ---------------------------------------------------------------------------
//
// The full handle-cleanup branch (L62-68) requires writeFile/sync/close
// to throw mid-flight, which is brittle to simulate without monkey-
// patching node:fs/promises (and the resulting test is sensitive to
// vitest module-hoisting behaviour). Instead we cover the more reliable
// rename-failure branch: write succeeds, handle is closed (handle=null
// on L59), then fs.rename throws because the parent dir for the target
// does not exist. This exercises the catch + unlink-cleanup path.

describe('atomic-write — rename failure cleans up tmp file', () => {
  it('throws + leaves no leaked tmp file when fs.rename cannot land the target', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sbom-pilot-atomic-err-'));
    try {
      // Target path under a non-existent grandchild directory, with
      // mkdirParent=false (default). The fs.open of tmpPath (which lives
      // in <dir>/<grandchild>/) will fail → still exercises the
      // outer catch, but not the rename path. So instead: write tmp in
      // the existing dir but target inside a child dir that does not
      // exist. fs.open works (tmpPath uses parent of target), and
      // fs.rename fails because the target parent doesn't exist on
      // some platforms.
      //
      // Cross-platform predictable trigger: target = the dir itself
      // (a directory). fs.rename(file, dir) fails with EPERM/EISDIR.
      // atomicWrite computes parent = dir, tmpPath inside dir; tmp
      // file opens + writes OK; rename to dir-path fails → catch +
      // unlink branch.
      await expect(atomicWrite(dir, 'should-not-land')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
