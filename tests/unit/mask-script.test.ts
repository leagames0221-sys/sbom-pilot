import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Tests for `scripts/check_forbidden_tokens.py`.
 *
 * Strategy: spin up a temporary git repository, install a mask file with a
 * known forbidden token, stage content that does / does not contain the
 * token, then invoke the script and assert the exit code.
 *
 * Spec mapping: PJ rule (channel B mask), ADR-0007 Phase α exit checklist.
 */

const SCRIPT_REL = 'scripts/check_forbidden_tokens.py';
const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT_PATH = join(PROJECT_ROOT, SCRIPT_REL);

interface Sandbox {
  readonly path: string;
}

async function makeRepo(): Promise<Sandbox> {
  const path = join(tmpdir(), `sbom-pilot-mask-test-${randomBytes(6).toString('hex')}`);
  await fs.mkdir(path, { recursive: true });
  const run = (args: string[]) => spawnSync('git', args, { cwd: path, encoding: 'utf8' });
  run(['init', '-b', 'main']);
  run(['config', 'user.email', 'test@example.invalid']);
  run(['config', 'user.name', 'mask test']);
  run(['config', 'commit.gpgsign', 'false']);
  return { path };
}

async function destroyRepo(sandbox: Sandbox): Promise<void> {
  await fs.rm(sandbox.path, { recursive: true, force: true });
}

async function writeMask(sandbox: Sandbox, tokens: readonly string[]): Promise<void> {
  await fs.mkdir(join(sandbox.path, '.claude'), { recursive: true });
  const body =
    '# internal notes\n\n## Forbidden tokens (test fixture)\n\n' +
    tokens.map((t) => `- ${t}`).join('\n') +
    '\n';
  await fs.writeFile(join(sandbox.path, '.claude', 'internal_notes.md'), body, 'utf8');
}

async function writeStagedFile(sandbox: Sandbox, name: string, body: string): Promise<void> {
  await fs.writeFile(join(sandbox.path, name), body, 'utf8');
  spawnSync('git', ['add', name], { cwd: sandbox.path });
}

function runScript(sandbox: Sandbox): { code: number; stderr: string; stdout: string } {
  const result = spawnSync('python', [SCRIPT_PATH], {
    cwd: sandbox.path,
    encoding: 'utf8',
  });
  return {
    code: result.status ?? -1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

describe('check_forbidden_tokens.py', () => {
  let sandbox: Sandbox;

  beforeEach(async () => {
    sandbox = await makeRepo();
  });

  afterEach(async () => {
    await destroyRepo(sandbox);
  });

  it('exits 0 when staged diff contains no forbidden token', async () => {
    await writeMask(sandbox, ['FORBIDDEN_MARKER_TOK']);
    await writeStagedFile(sandbox, 'clean.txt', 'hello world\n');
    const r = runScript(sandbox);
    expect(r.code).toBe(0);
  });

  it('exits 1 when staged diff contains a forbidden token (substring match)', async () => {
    await writeMask(sandbox, ['FORBIDDEN_MARKER_TOK']);
    await writeStagedFile(sandbox, 'dirty.txt', 'foo FORBIDDEN_MARKER_TOK bar\n');
    const r = runScript(sandbox);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('FORBIDDEN_MARKER_TOK');
  });

  it('matches case-insensitively', async () => {
    await writeMask(sandbox, ['UpperCase']);
    await writeStagedFile(sandbox, 'mixed.txt', 'this contains uppercase token\n');
    const r = runScript(sandbox);
    expect(r.code).toBe(1);
  });

  it('exits 1 (fail-closed) when mask file is missing', async () => {
    await writeStagedFile(sandbox, 'something.txt', 'hello\n');
    const r = runScript(sandbox);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('mask file missing');
  });

  it('exits 1 (fail-closed) when mask file has no forbidden-tokens section', async () => {
    await fs.mkdir(join(sandbox.path, '.claude'), { recursive: true });
    await fs.writeFile(
      join(sandbox.path, '.claude', 'internal_notes.md'),
      '# notes only, no token section\n',
      'utf8',
    );
    await writeStagedFile(sandbox, 'something.txt', 'hello\n');
    const r = runScript(sandbox);
    expect(r.code).toBe(1);
  });

  it('exits 0 when nothing is staged (regardless of mask state)', async () => {
    await writeMask(sandbox, ['SOME_TOKEN']);
    const r = runScript(sandbox);
    expect(r.code).toBe(0);
  });

  it('exits 2 when run outside a git repository', () => {
    const result = spawnSync('python', [SCRIPT_PATH], {
      cwd: tmpdir(),
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
  });
});
