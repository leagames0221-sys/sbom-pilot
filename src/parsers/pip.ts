/**
 * pip parser — requirements.txt + pip-tools lockfile → SbomIR.
 *
 * Recognises the three patterns mandated by tasks.md T-10 Verify:
 *   1. `name==X.Y.Z`               (exact pin)
 *   2. `name>=X.Y[,<W.W]`           (PEP 440 version range — lower bound captured)
 *   3. `name==X.Y.Z --hash=algo:…`  (pip-tools lockfile, multi-line via `\` continuation)
 *
 * Per ADR-0006 module boundary: Layer 1, writes only to the IR.
 *
 * Scope (T-10):
 *   - Single-file ingest: `<projectDir>/requirements.txt`.
 *   - No transitive graph (requirements.txt is flat by convention; nesting
 *     is via `-r other.txt` which T-10 does NOT follow recursively).
 *   - No `requirements-dev.txt` auto-detection (separate file conventions
 *     are handled by the dispatch layer in T-12 / CLI in L8).
 *   - License field is unavailable from requirements.txt; left absent
 *     (AC-001-7 is conditional on "known").
 *
 * Spec mapping: AC-001-1, ADR-0005, ADR-0006.
 */
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  Component,
  ComponentHash,
  Relationship,
  SbomIR,
} from '../ir/index.js';

export interface PipParseOptions {
  namespace?: string;
  creatorVersion?: string;
  createdAt?: string;
  rootName?: string;
  rootVersion?: string;
}

export interface ParsedRequirement {
  name: string;
  /**
   * For ==pinned: the literal exact version.
   * For >=range: the lower bound after stripping `>=`.
   * Callers should treat unpinned ranges as a soft version with a
   * `versionResolved=false` flag if they need exact downstream behavior.
   */
  version: string;
  versionResolved: boolean;
  hashes: ComponentHash[];
}

/**
 * PyPI projects use the canonical pURL form `pkg:pypi/<name>@<version>`.
 * Per the pURL pypi type, the name is normalized: lowercased, underscores
 * collapsed to hyphens. Per PEP 503 normalization.
 *
 * @see https://github.com/package-url/purl-spec/blob/main/PURL-TYPES.rst#pypi
 * @see https://peps.python.org/pep-0503/
 */
export function pypiPurl(packageName: string, version: string): string {
  const normalized = packageName.toLowerCase().replace(/_/g, '-');
  return `pkg:pypi/${normalized}@${version}`;
}

/**
 * Join `\`-continued lines into single logical lines per pip's parsing
 * convention. A trailing `\` at end-of-line means "continue on the next
 * line, separated by a single space".
 */
export function joinContinuations(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const logical: string[] = [];
  let buffer = '';
  for (const line of lines) {
    if (line.endsWith('\\')) {
      buffer += line.slice(0, -1) + ' ';
      continue;
    }
    buffer += line;
    logical.push(buffer);
    buffer = '';
  }
  if (buffer.length > 0) logical.push(buffer);
  return logical;
}

const PEP440_NAME = /^([A-Za-z0-9][A-Za-z0-9._-]*)/;

/**
 * Parse a single (already-joined) requirements.txt logical line.
 *
 * Returns null for: comments, blank lines, `-r/-c` include directives,
 * editable installs (`-e`), URL/path installs, and any line whose name
 * doesn't match PEP 440.
 */
export function parseRequirementLine(line: string): ParsedRequirement | null {
  // Strip inline comment (after a space-#-)
  const commentSplit = line.split(/\s+#/);
  const stripped = (commentSplit[0] ?? '').trim();
  if (stripped.length === 0) return null;
  if (stripped.startsWith('#')) return null;
  if (stripped.startsWith('-')) return null;
  if (
    stripped.includes('://') ||
    stripped.startsWith('./') ||
    stripped.startsWith('file:')
  ) {
    return null;
  }

  const nameMatch = stripped.match(PEP440_NAME);
  if (nameMatch === null) return null;
  const name = nameMatch[1] ?? '';
  if (name.length === 0) return null;

  const rest = stripped.slice(name.length).trim();

  // Hashes (pip-tools / pip --require-hashes lockfile)
  const hashes: ComponentHash[] = [];
  const hashRegex = /--hash=(sha256|sha512):([a-fA-F0-9]+)/g;
  let hashMatch: RegExpExecArray | null;
  while ((hashMatch = hashRegex.exec(rest)) !== null) {
    const algoRaw = hashMatch[1] ?? '';
    const value = hashMatch[2] ?? '';
    const algorithm: ComponentHash['algorithm'] =
      algoRaw === 'sha512' ? 'SHA-512' : 'SHA-256';
    hashes.push({ algorithm, value });
  }

  // Strip everything from the first `--` so version-specifier parsing is
  // not confused by hash arguments.
  const beforeFlags = rest.split(/\s+--/)[0] ?? '';
  const specifier = beforeFlags.replace(/\[[^\]]*\]/, '').trim(); // strip extras like [security]

  if (specifier.length === 0) {
    // Bare package name with no version — not enough info for SBOM (PURL
    // requires a version). Skip per spec contract.
    return null;
  }

  // ==X.Y.Z pin (possibly with leading whitespace)
  const exactMatch = specifier.match(/^==\s*([A-Za-z0-9._+!-]+)/);
  if (exactMatch !== null) {
    return {
      name,
      version: exactMatch[1] ?? '',
      versionResolved: true,
      hashes,
    };
  }

  // >=X.Y range — capture lower bound
  const rangeMatch = specifier.match(/^>=\s*([A-Za-z0-9._+!-]+)/);
  if (rangeMatch !== null) {
    return {
      name,
      version: rangeMatch[1] ?? '',
      versionResolved: false,
      hashes,
    };
  }

  return null;
}

/**
 * Parse a pip project directory into an SbomIR.
 *
 * Reads `<projectDir>/requirements.txt`. Throws if the file is missing
 * or unreadable.
 */
export async function parsePipProject(
  projectDir: string,
  options: PipParseOptions = {},
): Promise<SbomIR> {
  const reqPath = join(projectDir, 'requirements.txt');
  const text = await fs.readFile(reqPath, 'utf8');

  const rootName = options.rootName ?? basename(projectDir);
  const rootVersion = options.rootVersion ?? '0.0.0';
  const rootId = 'root';

  const rootComponent: Component = {
    id: rootId,
    purl: pypiPurl(rootName, rootVersion),
    name: rootName,
    version: rootVersion,
    ecosystem: 'PyPI',
  };

  const components: Component[] = [rootComponent];
  const relationships: Relationship[] = [];

  const seenNames = new Set<string>();
  for (const logicalLine of joinContinuations(text)) {
    const parsed = parseRequirementLine(logicalLine);
    if (parsed === null) continue;
    if (seenNames.has(parsed.name.toLowerCase())) continue;
    seenNames.add(parsed.name.toLowerCase());

    const componentId = `pypi:${parsed.name.toLowerCase()}@${parsed.version}`;
    const component: Component = {
      id: componentId,
      purl: pypiPurl(parsed.name, parsed.version),
      name: parsed.name,
      version: parsed.version,
      ecosystem: 'PyPI',
    };
    if (parsed.hashes.length > 0) {
      // IR carries a single hash slot; pick the first SHA-256, falling
      // back to the first entry. Multi-hash storage is a future IR
      // extension if needed.
      const sha256 = parsed.hashes.find((h) => h.algorithm === 'SHA-256');
      component.hash = sha256 ?? parsed.hashes[0];
    }
    components.push(component);
    relationships.push({
      from: rootId,
      to: componentId,
      type: 'depends-on',
    });
  }

  return {
    document: {
      namespace:
        options.namespace ??
        `urn:sbom-pilot:pip:${rootName}@${rootVersion}`,
      createdAt: options.createdAt ?? new Date().toISOString(),
      creator: 'sbom-pilot',
      creatorVersion: options.creatorVersion ?? '0.0.0-dev',
      rootComponent: rootId,
    },
    components,
    relationships,
  };
}
