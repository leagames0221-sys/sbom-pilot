import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { atomicWrite } from '../../../src/util/atomic-write.js';

describe('atomicWrite', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `sbom-pilot-test-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('writes a string payload atomically', async () => {
    const target = join(workDir, 'out.json');
    await atomicWrite(target, '{"hello":"world"}\n');
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe('{"hello":"world"}\n');
  });

  it('writes a Uint8Array payload', async () => {
    const target = join(workDir, 'binary.bin');
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    await atomicWrite(target, bytes);
    const content = await fs.readFile(target);
    expect(Array.from(content)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it('creates the parent directory when mkdirParent is true', async () => {
    const target = join(workDir, 'nested', 'deep', 'out.txt');
    await atomicWrite(target, 'ok', { mkdirParent: true });
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe('ok');
  });

  it('rejects when parent directory is missing without mkdirParent', async () => {
    const target = join(workDir, 'absent-dir', 'out.txt');
    await expect(atomicWrite(target, 'x')).rejects.toThrow();
  });

  it('leaves no temp file behind on the happy path', async () => {
    const target = join(workDir, 'final.txt');
    await atomicWrite(target, 'final');
    const entries = await fs.readdir(workDir);
    const tmpEntries = entries.filter((e) => e.includes('.tmp-'));
    expect(tmpEntries).toEqual([]);
    expect(entries).toContain('final.txt');
  });

  it('preserves UTF-8 byte sequences for multibyte content', async () => {
    const target = join(workDir, 'jp.txt');
    const payload = '改正個情法 26-2 SBOM テスト';
    await atomicWrite(target, payload);
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe(payload);
  });

  it('honours custom file mode', async () => {
    if (process.platform === 'win32') {
      // POSIX mode bits are not honoured on Windows; assert no error.
      const target = join(workDir, 'mode.txt');
      await atomicWrite(target, 'x', { mode: 0o600 });
      const content = await fs.readFile(target, 'utf8');
      expect(content).toBe('x');
      return;
    }
    const target = join(workDir, 'mode.txt');
    await atomicWrite(target, 'x', { mode: 0o600 });
    const stat = await fs.stat(target);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
