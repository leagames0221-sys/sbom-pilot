/**
 * Unit tests for the Go module parser.
 *
 * Fixture: tests/fixtures/projects/go-mod-tiny/ — synthetic go.mod with 4
 * require directives across 3 forms (require-block, single-line require,
 * single-line require with `// indirect`) plus a populated go.sum.
 *
 * Spec mapping: AC-001-1, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  golangPurl,
  parseGoModProject,
  parseGoModText,
  stripGoLineComment,
} from '../../../src/parsers/go-mod.js';
import { SbomIRSchema } from '../../../src/ir/index.js';

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'projects',
  'go-mod-tiny',
);

const parseFixture = () =>
  parseGoModProject(fixtureDir, {
    namespace: 'urn:sbom-pilot:test:go-mod-tiny',
    creatorVersion: '0.0.0-test',
    createdAt: '2026-05-20T00:00:00Z',
    rootVersion: '1.0.0',
  });

describe('golangPurl', () => {
  it('preserves full module path with literal slashes', () => {
    expect(golangPurl('github.com/gin-gonic/gin', 'v1.9.1')).toBe(
      'pkg:golang/github.com/gin-gonic/gin@v1.9.1',
    );
  });

  it('handles two-segment module paths', () => {
    expect(golangPurl('golang.org/x/text', 'v0.14.0')).toBe(
      'pkg:golang/golang.org/x/text@v0.14.0',
    );
  });
});

describe('stripGoLineComment', () => {
  it('returns code unchanged when there is no comment', () => {
    expect(stripGoLineComment('require foo v1.0.0')).toEqual({
      code: 'require foo v1.0.0',
      indirect: false,
    });
  });

  it('strips a trailing comment and reports indirect=false by default', () => {
    expect(stripGoLineComment('foo v1.0.0 // some note')).toEqual({
      code: 'foo v1.0.0',
      indirect: false,
    });
  });

  it('detects indirect marker', () => {
    expect(stripGoLineComment('foo v1.0.0 // indirect')).toEqual({
      code: 'foo v1.0.0',
      indirect: true,
    });
  });

  it('detects indirect marker among other words', () => {
    expect(stripGoLineComment('foo v1.0.0 // some note; indirect')).toEqual({
      code: 'foo v1.0.0',
      indirect: true,
    });
  });
});

describe('parseGoModText', () => {
  it('extracts the module path', () => {
    const { modulePath } = parseGoModText('module example.com/myapp\n');
    expect(modulePath).toBe('example.com/myapp');
  });

  it('parses a single-line require', () => {
    const { requires } = parseGoModText(
      'module x\n\nrequire foo v1.0.0\n',
    );
    expect(requires).toEqual([
      { module: 'foo', version: 'v1.0.0', indirect: false },
    ]);
  });

  it('parses a require block with multiple entries', () => {
    const { requires } = parseGoModText(
      'module x\n\nrequire (\n\tfoo v1.0.0\n\tbar v2.3.4\n)\n',
    );
    expect(requires).toEqual([
      { module: 'foo', version: 'v1.0.0', indirect: false },
      { module: 'bar', version: 'v2.3.4', indirect: false },
    ]);
  });

  it('marks an indirect single-line require', () => {
    const { requires } = parseGoModText(
      'module x\n\nrequire foo v1.0.0 // indirect\n',
    );
    expect(requires[0]?.indirect).toBe(true);
  });

  it('marks indirect entries inside a require block', () => {
    const { requires } = parseGoModText(
      'module x\n\nrequire (\n\tfoo v1.0.0 // indirect\n)\n',
    );
    expect(requires[0]?.indirect).toBe(true);
  });

  it('ignores `go`, `toolchain`, `replace`, `exclude`, `retract`', () => {
    const text =
      'module x\n\n' +
      'go 1.21\n' +
      'toolchain go1.21.0\n' +
      'replace foo => ../foo\n' +
      'exclude bar v1.0.0\n' +
      'retract v0.1.0\n';
    const { modulePath, requires } = parseGoModText(text);
    expect(modulePath).toBe('x');
    expect(requires).toHaveLength(0);
  });
});

describe('parseGoModProject — go-mod-tiny fixture', () => {
  it('produces an IR that validates against SbomIRSchema', async () => {
    const ir = await parseFixture();
    expect(() => SbomIRSchema.parse(ir)).not.toThrow();
  });

  it('emits exactly 5 components (1 root + 4 require directives)', async () => {
    const ir = await parseFixture();
    expect(ir.components).toHaveLength(5);
  });

  it('emits exactly 4 depends-on relationships from root', async () => {
    const ir = await parseFixture();
    expect(ir.relationships).toHaveLength(4);
    for (const rel of ir.relationships) {
      expect(rel.type).toBe('depends-on');
      expect(rel.from).toBe('root');
    }
  });

  it('uses pkg:golang/<full-module-path> pURLs', async () => {
    const ir = await parseFixture();
    const byName = new Map(ir.components.map((c) => [c.name, c.purl]));
    expect(byName.get('github.com/gin-gonic/gin')).toBe(
      'pkg:golang/github.com/gin-gonic/gin@v1.9.1',
    );
    expect(byName.get('golang.org/x/text')).toBe(
      'pkg:golang/golang.org/x/text@v0.14.0',
    );
    expect(byName.get('github.com/spf13/cobra')).toBe(
      'pkg:golang/github.com/spf13/cobra@v1.8.0',
    );
  });

  it('uses the go.mod module path as the root name + pURL', async () => {
    const ir = await parseFixture();
    const root = ir.components.find((c) => c.id === 'root');
    expect(root?.name).toBe('example.com/go-tiny');
    expect(root?.purl).toBe('pkg:golang/example.com/go-tiny@1.0.0');
  });

  it('marks every component ecosystem as Go', async () => {
    const ir = await parseFixture();
    for (const c of ir.components) {
      expect(c.ecosystem).toBe('Go');
    }
  });

  it('leaves component hash absent (go.sum content not parsed at T-11)', async () => {
    const ir = await parseFixture();
    const deps = ir.components.filter((c) => c.id !== 'root');
    for (const dep of deps) {
      expect(dep.hash).toBeUndefined();
    }
  });

  it('produces a deterministic IR for the same input twice', async () => {
    const a = await parseFixture();
    const b = await parseFixture();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('honors namespace / creatorVersion / createdAt / rootVersion overrides', async () => {
    const ir = await parseFixture();
    expect(ir.document.namespace).toBe('urn:sbom-pilot:test:go-mod-tiny');
    expect(ir.document.creatorVersion).toBe('0.0.0-test');
    expect(ir.document.createdAt).toBe('2026-05-20T00:00:00Z');
  });

  it('emits a rootComponent reference that exists in components', async () => {
    const ir = await parseFixture();
    const ids = new Set(ir.components.map((c) => c.id));
    expect(ids.has(ir.document.rootComponent)).toBe(true);
  });
});

describe('parseGoModProject — error paths', () => {
  it('throws when the project directory has no go.mod', async () => {
    await expect(parseGoModProject('/no/such/path')).rejects.toThrow();
  });
});
