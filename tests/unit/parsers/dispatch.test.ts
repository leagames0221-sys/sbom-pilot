/**
 * Unit tests for the manifest-detection dispatcher.
 *
 * Spec mapping: AC-001-1, AC-001-4, ADR-0005, ADR-0006.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  detectManifest,
  dispatchParser,
  DispatchError,
} from '../../../src/parsers/index.js';
import { EX_DATAERR } from '../../../src/exit-codes.js';

const fixturesRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'projects',
);

describe('detectManifest — existing fixtures', () => {
  it('detects pnpm-lock.yaml as the pnpm manifest', async () => {
    expect(await detectManifest(join(fixturesRoot, 'pnpm-tiny'))).toBe('pnpm');
  });

  it('detects package-lock.json as the npm manifest', async () => {
    expect(await detectManifest(join(fixturesRoot, 'npm-tiny'))).toBe('npm');
  });

  it('detects requirements.txt as the pip manifest', async () => {
    expect(await detectManifest(join(fixturesRoot, 'pip-tiny'))).toBe('pip');
  });

  it('detects go.mod as the Go manifest', async () => {
    expect(await detectManifest(join(fixturesRoot, 'go-mod-tiny'))).toBe(
      'go-mod',
    );
  });
});

describe('detectManifest — priority order', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `sbom-pilot-dispatch-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('returns null when no supported manifest is present', async () => {
    expect(await detectManifest(workDir)).toBeNull();
  });

  it('prefers pnpm-lock.yaml over package-lock.json and package.json', async () => {
    await fs.writeFile(join(workDir, 'pnpm-lock.yaml'), '{}');
    await fs.writeFile(join(workDir, 'package-lock.json'), '{}');
    await fs.writeFile(join(workDir, 'package.json'), '{}');
    expect(await detectManifest(workDir)).toBe('pnpm');
  });

  it('prefers package-lock.json over a bare package.json', async () => {
    await fs.writeFile(join(workDir, 'package-lock.json'), '{}');
    await fs.writeFile(join(workDir, 'package.json'), '{}');
    expect(await detectManifest(workDir)).toBe('npm');
  });

  it('falls back to package.json alone as an npm-type project', async () => {
    await fs.writeFile(join(workDir, 'package.json'), '{}');
    expect(await detectManifest(workDir)).toBe('npm');
  });

  it('detects requirements.txt independently of other manifests being absent', async () => {
    await fs.writeFile(join(workDir, 'requirements.txt'), '# empty\n');
    expect(await detectManifest(workDir)).toBe('pip');
  });

  it('detects go.mod independently of other manifests being absent', async () => {
    await fs.writeFile(join(workDir, 'go.mod'), 'module x\n');
    expect(await detectManifest(workDir)).toBe('go-mod');
  });

  it('still picks pnpm when both pnpm-lock.yaml and requirements.txt coexist', async () => {
    // Polyglot repo — JS toolchain wins per priority order.
    await fs.writeFile(join(workDir, 'pnpm-lock.yaml'), '{}');
    await fs.writeFile(join(workDir, 'requirements.txt'), 'x==1.0\n');
    expect(await detectManifest(workDir)).toBe('pnpm');
  });
});

describe('dispatchParser — routes to the matching parser', () => {
  it('routes pnpm-tiny fixture → pnpm parser (IR with importers["."])', async () => {
    const ir = await dispatchParser(join(fixturesRoot, 'pnpm-tiny'), {
      namespace: 'urn:sbom-pilot:test:dispatch-pnpm',
      creatorVersion: '0.0.0-test',
      createdAt: '2026-05-20T00:00:00Z',
    });
    expect(ir.components.length).toBe(5);
    expect(ir.document.namespace).toBe('urn:sbom-pilot:test:dispatch-pnpm');
  });

  it('routes npm-tiny fixture → npm parser', async () => {
    const ir = await dispatchParser(join(fixturesRoot, 'npm-tiny'), {
      namespace: 'urn:sbom-pilot:test:dispatch-npm',
      creatorVersion: '0.0.0-test',
      createdAt: '2026-05-20T00:00:00Z',
    });
    expect(ir.components.length).toBe(6);
  });

  it('routes pip-tiny fixture → pip parser', async () => {
    const ir = await dispatchParser(join(fixturesRoot, 'pip-tiny'), {
      namespace: 'urn:sbom-pilot:test:dispatch-pip',
      creatorVersion: '0.0.0-test',
      createdAt: '2026-05-20T00:00:00Z',
      rootName: 'pip-tiny-fixture',
      rootVersion: '1.0.0',
    });
    expect(ir.components.length).toBe(6);
    for (const c of ir.components) {
      expect(c.ecosystem).toBe('PyPI');
    }
  });

  it('routes go-mod-tiny fixture → Go parser', async () => {
    const ir = await dispatchParser(join(fixturesRoot, 'go-mod-tiny'), {
      namespace: 'urn:sbom-pilot:test:dispatch-go',
      creatorVersion: '0.0.0-test',
      createdAt: '2026-05-20T00:00:00Z',
      rootVersion: '1.0.0',
    });
    expect(ir.components.length).toBe(5);
    for (const c of ir.components) {
      expect(c.ecosystem).toBe('Go');
    }
  });
});

describe('dispatchParser — empty directory raises DispatchError with EX_DATAERR', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `sbom-pilot-dispatch-empty-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('throws DispatchError when no supported manifest is present', async () => {
    await expect(dispatchParser(workDir)).rejects.toBeInstanceOf(
      DispatchError,
    );
  });

  it('exposes EX_DATAERR on the thrown DispatchError', async () => {
    try {
      await dispatchParser(workDir);
      throw new Error('expected DispatchError');
    } catch (e) {
      expect(e).toBeInstanceOf(DispatchError);
      expect((e as DispatchError).exitCode).toBe(EX_DATAERR);
    }
  });

  it('includes the project directory in the error message', async () => {
    try {
      await dispatchParser(workDir);
      throw new Error('expected DispatchError');
    } catch (e) {
      expect(e).toBeInstanceOf(DispatchError);
      expect((e as DispatchError).message).toContain(workDir);
    }
  });
});
