/**
 * Go module parser — go.mod (+ go.sum) → SbomIR.
 *
 * Recognises three forms of `require` directives:
 *   1. Inside a `require ( ... )` block, one module per line
 *   2. Single-line `require <module> <version>` (with or without `// indirect`)
 *   3. Inline `// indirect` comment marking a transitive-but-recorded entry
 *
 * Per ADR-0006 module boundary: Layer 1, writes only to the IR.
 *
 * Scope (T-11):
 *   - go.mod is the source of truth for required modules and versions.
 *   - go.sum existence is verified but content is not yet parsed for hashes.
 *     Go's `h1:` checksum is base64(SHA-256(zip-content)), not raw hex; a
 *     future enrichment pass can decode and populate Component.hash with
 *     an SHA-256 algorithm marker once the canonical encoding is settled.
 *   - `replace`, `exclude`, `retract` directives are skipped.
 *
 * Spec mapping: AC-001-1, ADR-0005, ADR-0006.
 */
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  Component,
  Relationship,
  SbomIR,
} from '../ir/index.js';

export interface GoModParseOptions {
  namespace?: string;
  creatorVersion?: string;
  createdAt?: string;
  rootName?: string;
  rootVersion?: string;
}

export interface GoModRequire {
  module: string;
  version: string;
  indirect: boolean;
}

/**
 * pURL spec for the `golang` type:
 *   pkg:golang/<namespace>/<name>@<version>
 *
 * The namespace portion may contain slashes. For Go modules where the
 * whole module path is the identifier (e.g. `github.com/gin-gonic/gin`),
 * the entire path is preserved as `namespace/name` with literal slashes
 * (the pURL spec keeps them unencoded for golang).
 *
 * @see https://github.com/package-url/purl-spec/blob/main/PURL-TYPES.rst#golang
 */
export function golangPurl(modulePath: string, version: string): string {
  return `pkg:golang/${modulePath}@${version}`;
}

/**
 * Strip an inline `// ...` comment (and surrounding whitespace) from a
 * go.mod line. Returns the leading code plus a boolean indicating whether
 * the comment text contained the word `indirect`.
 */
export function stripGoLineComment(line: string): {
  code: string;
  indirect: boolean;
} {
  const idx = line.indexOf('//');
  if (idx === -1) return { code: line.trimEnd(), indirect: false };
  const code = line.slice(0, idx).trimEnd();
  const comment = line.slice(idx + 2).trim();
  return { code, indirect: /\bindirect\b/.test(comment) };
}

/**
 * Parse a go.mod text into the module path and the flat list of required
 * modules. Exported for unit-testing the requirement extractor in
 * isolation from filesystem reads.
 */
export function parseGoModText(text: string): {
  modulePath: string | null;
  requires: GoModRequire[];
} {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let modulePath: string | null = null;
  const requires: GoModRequire[] = [];
  let insideRequireBlock = false;

  for (const rawLine of lines) {
    const { code, indirect } = stripGoLineComment(rawLine);
    const line = code.trim();
    if (line.length === 0) continue;

    if (!insideRequireBlock) {
      const moduleMatch = line.match(/^module\s+(\S+)/);
      if (moduleMatch !== null) {
        modulePath = moduleMatch[1] ?? null;
        continue;
      }
      if (line === 'require (') {
        insideRequireBlock = true;
        continue;
      }
      const requireMatch = line.match(/^require\s+(\S+)\s+(\S+)/);
      if (requireMatch !== null) {
        requires.push({
          module: requireMatch[1] ?? '',
          version: requireMatch[2] ?? '',
          indirect,
        });
        continue;
      }
      // Other directives (go, toolchain, replace, exclude, retract) are
      // ignored at T-11 scope.
      continue;
    }

    // Inside require ( ... ) block
    if (line === ')') {
      insideRequireBlock = false;
      continue;
    }
    const blockMatch = line.match(/^(\S+)\s+(\S+)/);
    if (blockMatch !== null) {
      requires.push({
        module: blockMatch[1] ?? '',
        version: blockMatch[2] ?? '',
        indirect,
      });
    }
  }

  return { modulePath, requires };
}

/**
 * Parse a Go-module project directory into an SbomIR.
 *
 * Reads `<projectDir>/go.mod`. The presence of go.sum is verified (an
 * empty file is acceptable) but its content is not parsed at T-11 scope.
 * Throws if go.mod is missing or unreadable.
 */
export async function parseGoModProject(
  projectDir: string,
  options: GoModParseOptions = {},
): Promise<SbomIR> {
  const goModText = await fs.readFile(join(projectDir, 'go.mod'), 'utf8');
  // Touch go.sum to confirm its presence per the manifest pair contract;
  // missing go.sum is a project hygiene flag the caller should know about.
  try {
    await fs.access(join(projectDir, 'go.sum'));
  } catch {
    // go.sum may legitimately be absent on a fresh module; do not throw.
  }

  const { modulePath, requires } = parseGoModText(goModText);

  const rootModulePath = modulePath ?? options.rootName ?? basename(projectDir);
  const rootName = options.rootName ?? rootModulePath;
  const rootVersion = options.rootVersion ?? '0.0.0';
  const rootId = 'root';

  const rootComponent: Component = {
    id: rootId,
    purl: golangPurl(rootModulePath, rootVersion),
    name: rootName,
    version: rootVersion,
    ecosystem: 'Go',
  };

  const components: Component[] = [rootComponent];
  const relationships: Relationship[] = [];

  for (const req of requires) {
    if (req.module.length === 0 || req.version.length === 0) continue;
    const componentId = `go:${req.module}@${req.version}`;
    components.push({
      id: componentId,
      purl: golangPurl(req.module, req.version),
      name: req.module,
      version: req.version,
      ecosystem: 'Go',
    });
    relationships.push({
      from: rootId,
      to: componentId,
      type: 'depends-on',
    });
  }

  return {
    document: {
      namespace:
        options.namespace ?? `urn:sbom-pilot:go:${rootModulePath}@${rootVersion}`,
      createdAt: options.createdAt ?? new Date().toISOString(),
      creator: 'sbom-pilot',
      creatorVersion: options.creatorVersion ?? '0.0.0-dev',
      rootComponent: rootId,
    },
    components,
    relationships,
  };
}
