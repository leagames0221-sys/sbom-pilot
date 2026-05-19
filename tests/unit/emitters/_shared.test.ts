/**
 * Unit tests for the emitter shared helpers.
 *
 * Spec mapping: AC-001-3, AC-001-8, AC-003-5, ADR-0005, ADR-0006.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  computeDeterministicNamespace,
  emitToFile,
  formatCitationFooter,
  serializeDocument,
  sortObjectKeysDeep,
} from '../../../src/emitters/_shared.js';

describe('computeDeterministicNamespace', () => {
  it('produces a urn:sbom-pilot:<format>:<16-hex> shape', () => {
    const ns = computeDeterministicNamespace(
      '/projects/example',
      'abc123def456',
      'spdx-2.3',
    );
    expect(ns).toMatch(/^urn:sbom-pilot:spdx-2\.3:[0-9a-f]{16}$/);
  });

  it('is deterministic — same inputs yield byte-identical URN', () => {
    const a = computeDeterministicNamespace('/p', 'sha-1', 'cyclonedx-1.5');
    const b = computeDeterministicNamespace('/p', 'sha-1', 'cyclonedx-1.5');
    expect(a).toBe(b);
  });

  it('changes when the project path changes', () => {
    const a = computeDeterministicNamespace('/p1', 'sha', 'spdx-2.3');
    const b = computeDeterministicNamespace('/p2', 'sha', 'spdx-2.3');
    expect(a).not.toBe(b);
  });

  it('changes when the git HEAD changes', () => {
    const a = computeDeterministicNamespace('/p', 'sha-A', 'spdx-2.3');
    const b = computeDeterministicNamespace('/p', 'sha-B', 'spdx-2.3');
    expect(a).not.toBe(b);
  });

  it('changes when the format changes', () => {
    const a = computeDeterministicNamespace('/p', 'sha', 'spdx-2.3');
    const b = computeDeterministicNamespace('/p', 'sha', 'cyclonedx-1.5');
    expect(a).not.toBe(b);
  });

  it('uses the literal "no-git" sentinel when gitHead is null', () => {
    const withNull = computeDeterministicNamespace('/p', null, 'spdx-2.3');
    const withSentinel = computeDeterministicNamespace(
      '/p',
      'no-git',
      'spdx-2.3',
    );
    // Note: the two must NOT be identical because the format string
    // embeds `gitHead` directly when supplied, but null also produces
    // the sentinel — assert that the null path produces a stable URN.
    expect(withNull).toMatch(/^urn:sbom-pilot:spdx-2\.3:[0-9a-f]{16}$/);
    expect(withSentinel).toMatch(/^urn:sbom-pilot:spdx-2\.3:[0-9a-f]{16}$/);
    // Both pass through the same internal sentinel-merge path so they
    // happen to be equal — verify that.
    expect(withNull).toBe(withSentinel);
  });
});

describe('formatCitationFooter', () => {
  it('emits the SPDX `Tool: name-version` shape', () => {
    expect(formatCitationFooter('0.1.0')).toBe('Tool: sbom-pilot-0.1.0');
  });

  it('preserves arbitrary semver-prerelease suffixes verbatim', () => {
    expect(formatCitationFooter('0.0.0-dev.20260520')).toBe(
      'Tool: sbom-pilot-0.0.0-dev.20260520',
    );
  });
});

describe('sortObjectKeysDeep', () => {
  it('sorts top-level keys lexically', () => {
    const out = sortObjectKeysDeep({ b: 1, a: 2, c: 3 });
    expect(Object.keys(out as object)).toEqual(['a', 'b', 'c']);
  });

  it('sorts nested object keys recursively', () => {
    const out = sortObjectKeysDeep({
      outer: { z: 1, a: 2 },
      first: 1,
    }) as { first: number; outer: Record<string, number> };
    expect(Object.keys(out)).toEqual(['first', 'outer']);
    expect(Object.keys(out.outer)).toEqual(['a', 'z']);
  });

  it('preserves array order (arrays carry positional semantics)', () => {
    const out = sortObjectKeysDeep([3, 1, 2]);
    expect(out).toEqual([3, 1, 2]);
  });

  it('recursively sorts inside arrays of objects', () => {
    const out = sortObjectKeysDeep([{ b: 1, a: 2 }, { d: 3, c: 4 }]) as Array<
      Record<string, number>
    >;
    expect(Object.keys(out[0]!)).toEqual(['a', 'b']);
    expect(Object.keys(out[1]!)).toEqual(['c', 'd']);
  });

  it('passes primitives and null through unchanged', () => {
    expect(sortObjectKeysDeep(42)).toBe(42);
    expect(sortObjectKeysDeep('hello')).toBe('hello');
    expect(sortObjectKeysDeep(null)).toBeNull();
  });
});

describe('serializeDocument', () => {
  it('produces deterministic output for the same input on repeat calls', () => {
    const doc = { b: 2, a: { z: 1, y: 2 } };
    const a = serializeDocument(doc);
    const b = serializeDocument(doc);
    expect(a).toBe(b);
  });

  it('produces the same output regardless of input key order', () => {
    const a = serializeDocument({ a: 1, b: 2, c: 3 });
    const b = serializeDocument({ c: 3, b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('ends the output with a trailing newline', () => {
    const out = serializeDocument({ a: 1 });
    expect(out.endsWith('\n')).toBe(true);
  });

  it('respects the indent override', () => {
    const out = serializeDocument({ a: 1 }, 4);
    expect(out).toContain('    "a": 1');
  });
});

describe('emitToFile', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = join(tmpdir(), `sbom-pilot-emit-${randomBytes(6).toString('hex')}`);
    await fs.mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('writes the serialised document to disk atomically', async () => {
    const target = join(workDir, 'out.json');
    const doc = { z: 1, a: { c: 3, b: 2 } };
    const returned = await emitToFile(doc, target);
    const onDisk = await fs.readFile(target, 'utf8');
    expect(onDisk).toBe(returned);
    expect(onDisk.endsWith('\n')).toBe(true);
    // Sorted keys at every level
    const parsed = JSON.parse(onDisk);
    expect(Object.keys(parsed)).toEqual(['a', 'z']);
    expect(Object.keys(parsed.a)).toEqual(['b', 'c']);
  });
});
