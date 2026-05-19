/**
 * Unit tests for the pip parser.
 *
 * Fixture: tests/fixtures/projects/pip-tiny/ — synthetic requirements.txt
 * covering the three patterns mandated by tasks.md T-10 Verify:
 *   1. ==pin (flask, requests, sqlalchemy)
 *   2. >=range (pydantic — lower bound captured, versionResolved=false)
 *   3. hash-pinned (django with two sha256 hashes, multi-line \ continuation)
 *
 * Spec mapping: AC-001-1, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  joinContinuations,
  parsePipProject,
  parseRequirementLine,
  pypiPurl,
} from '../../../src/parsers/pip.js';
import { SbomIRSchema } from '../../../src/ir/index.js';

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'projects',
  'pip-tiny',
);

const parseFixture = () =>
  parsePipProject(fixtureDir, {
    namespace: 'urn:sbom-pilot:test:pip-tiny',
    creatorVersion: '0.0.0-test',
    createdAt: '2026-05-20T00:00:00Z',
    rootName: 'pip-tiny-fixture',
    rootVersion: '1.0.0',
  });

describe('pypiPurl', () => {
  it('formats with pkg:pypi/ prefix and PEP 503 normalized name', () => {
    expect(pypiPurl('Flask', '3.0.0')).toBe('pkg:pypi/flask@3.0.0');
  });

  it('collapses underscores to hyphens per PEP 503', () => {
    expect(pypiPurl('my_pkg', '1.0.0')).toBe('pkg:pypi/my-pkg@1.0.0');
  });
});

describe('joinContinuations', () => {
  it('joins a trailing \\ to the next line, preserving whitespace', () => {
    // pip's own join is whitespace-naïve; downstream regexes split on \s+
    // so the extra spaces around the boundary are harmless.
    const text = 'django==4.2.0 \\\n    --hash=sha256:abc';
    const joined = joinContinuations(text);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatch(/^django==4\.2\.0\s+--hash=sha256:abc$/);
  });

  it('leaves non-continued lines untouched', () => {
    expect(joinContinuations('flask==3.0.0\nrequests==2.31.0')).toEqual([
      'flask==3.0.0',
      'requests==2.31.0',
    ]);
  });

  it('normalizes CRLF before splitting', () => {
    expect(joinContinuations('flask==3.0.0\r\nrequests==2.31.0')).toEqual([
      'flask==3.0.0',
      'requests==2.31.0',
    ]);
  });
});

describe('parseRequirementLine', () => {
  it('returns null for blank lines', () => {
    expect(parseRequirementLine('')).toBeNull();
    expect(parseRequirementLine('   ')).toBeNull();
  });

  it('returns null for comment lines', () => {
    expect(parseRequirementLine('# this is a comment')).toBeNull();
  });

  it('returns null for include directives (-r / -c)', () => {
    expect(parseRequirementLine('-r other.txt')).toBeNull();
    expect(parseRequirementLine('-c constraints.txt')).toBeNull();
  });

  it('returns null for editable / URL / path installs', () => {
    expect(parseRequirementLine('-e .')).toBeNull();
    expect(parseRequirementLine('git+https://example.com/x.git')).toBeNull();
    expect(parseRequirementLine('./local-pkg')).toBeNull();
  });

  it('returns null for bare package names with no version', () => {
    expect(parseRequirementLine('requests')).toBeNull();
  });

  it('parses ==pin exact versions', () => {
    expect(parseRequirementLine('flask==3.0.0')).toEqual({
      name: 'flask',
      version: '3.0.0',
      versionResolved: true,
      hashes: [],
    });
  });

  it('parses >=range as lower bound with versionResolved=false', () => {
    expect(parseRequirementLine('pydantic>=2.0,<3.0')).toEqual({
      name: 'pydantic',
      version: '2.0',
      versionResolved: false,
      hashes: [],
    });
  });

  it('parses hash-pinned with single sha256 --hash', () => {
    const out = parseRequirementLine(
      'django==4.2.0 --hash=sha256:abcdef0123',
    );
    expect(out?.name).toBe('django');
    expect(out?.version).toBe('4.2.0');
    expect(out?.versionResolved).toBe(true);
    expect(out?.hashes).toEqual([
      { algorithm: 'SHA-256', value: 'abcdef0123' },
    ]);
  });

  it('parses multiple --hash flags on one logical line', () => {
    const out = parseRequirementLine(
      'django==4.2.0 --hash=sha256:aaaa --hash=sha256:bbbb',
    );
    expect(out?.hashes).toHaveLength(2);
  });

  it('promotes sha512 to SHA-512 in the IR hash slot', () => {
    const out = parseRequirementLine(
      'pkg==1.0.0 --hash=sha512:deadbeef',
    );
    expect(out?.hashes).toEqual([
      { algorithm: 'SHA-512', value: 'deadbeef' },
    ]);
  });

  it('strips PEP-508 extras [security] from the name lookup', () => {
    expect(parseRequirementLine('requests[security]==2.31.0')).toEqual({
      name: 'requests',
      version: '2.31.0',
      versionResolved: true,
      hashes: [],
    });
  });
});

describe('parsePipProject — pip-tiny fixture', () => {
  it('produces an IR that validates against SbomIRSchema', async () => {
    const ir = await parseFixture();
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });

  it('emits exactly 6 components (1 root + 5 deps)', async () => {
    const ir = await parseFixture();
    expect(ir.components).toHaveLength(6);
  });

  it('classifies every dep as depends-on (pip has no dev marker by file)', async () => {
    const ir = await parseFixture();
    expect(ir.relationships).toHaveLength(5);
    for (const rel of ir.relationships) {
      expect(rel.type).toBe('depends-on');
      expect(rel.from).toBe('root');
    }
  });

  it('captures the exact-pin versions for flask / requests / sqlalchemy', async () => {
    const ir = await parseFixture();
    const byName = new Map(ir.components.map((c) => [c.name, c.version]));
    expect(byName.get('flask')).toBe('3.0.0');
    expect(byName.get('requests')).toBe('2.31.0');
    expect(byName.get('sqlalchemy')).toBe('2.0.30');
  });

  it('captures the lower bound of the >= range for pydantic', async () => {
    const ir = await parseFixture();
    const pydantic = ir.components.find((c) => c.name === 'pydantic');
    expect(pydantic?.version).toBe('2.0');
  });

  it('captures the first sha256 hash on the django hash-pinned entry', async () => {
    const ir = await parseFixture();
    const django = ir.components.find((c) => c.name === 'django');
    expect(django?.hash?.algorithm).toBe('SHA-256');
    expect(django?.hash?.value).toBe(
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    );
  });

  it('uses PyPI ecosystem for every component including root', async () => {
    const ir = await parseFixture();
    for (const c of ir.components) {
      expect(c.ecosystem).toBe('PyPI');
    }
  });

  it('uses pypi pURL prefix for every component', async () => {
    const ir = await parseFixture();
    for (const c of ir.components) {
      expect(c.purl.startsWith('pkg:pypi/')).toBe(true);
    }
  });

  it('produces a deterministic IR for the same input twice', async () => {
    const a = await parseFixture();
    const b = await parseFixture();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('honors namespace / creatorVersion / createdAt / rootName / rootVersion overrides', async () => {
    const ir = await parseFixture();
    expect(ir.document.namespace).toBe('urn:sbom-pilot:test:pip-tiny');
    expect(ir.document.creatorVersion).toBe('0.0.0-test');
    expect(ir.document.createdAt).toBe('2026-05-20T00:00:00Z');
    const root = ir.components.find((c) => c.id === 'root');
    expect(root?.name).toBe('pip-tiny-fixture');
    expect(root?.version).toBe('1.0.0');
  });

  it('emits a rootComponent reference that exists in components', async () => {
    const ir = await parseFixture();
    const ids = new Set(ir.components.map((c) => c.id));
    expect(ids.has(ir.document.rootComponent)).toBe(true);
  });
});

describe('parsePipProject — error paths', () => {
  it('throws when the project directory has no requirements.txt', async () => {
    await expect(parsePipProject('/no/such/path')).rejects.toThrow();
  });
});
