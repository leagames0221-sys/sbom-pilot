/**
 * npm parser — package.json + package-lock.json → SbomIR.
 *
 * Reads a project directory containing an npm v2/v3 lockfile and produces
 * a populated SbomIR with one Component per resolved package plus a root
 * Component derived from the project manifest. Declared dependency types
 * (production vs devDependencies) become the `Relationship.type` between
 * the root and its direct deps.
 *
 * Per ADR-0006 module boundary: this module belongs to Layer 1 (parsers)
 * and writes only to the IR (Layer 2). It does not read scanners, emitters,
 * or CLI surfaces.
 *
 * Spec mapping:
 *   - AC-001-1 (manifest detection + ingest for npm projects)
 *   - AC-001-7 (SPDX License ID populated when the manifest provides one)
 *   - ADR-0005 §Decision (IR shape)
 *   - ADR-0006 §Dependency direction (parsers → IR only)
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type {
  Component,
  Relationship,
  SbomIR,
  LicenseExpression,
} from '../ir/index.js';

interface NpmManifest {
  name?: string;
  version?: string;
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface NpmLockPackageEntry {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  dev?: boolean;
  optional?: boolean;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
}

interface NpmLockfile {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, NpmLockPackageEntry>;
}

export interface NpmParseOptions {
  /**
   * Override the document namespace. When absent the parser synthesizes one
   * from the project name + version. Production code paths should pass an
   * explicit deterministic namespace (per AC-001-8) computed from the
   * project path + git HEAD.
   */
  namespace?: string;
  /**
   * Override the `creatorVersion` field on the IR document. When absent
   * defaults to the literal `'0.0.0-dev'` — production CLI wires the real
   * package version through.
   */
  creatorVersion?: string;
  /**
   * Override the `document.createdAt` ISO8601 string. Tests pin this for
   * deterministic golden snapshots.
   */
  createdAt?: string;
}

/**
 * pURL spec defines scoped npm packages as `pkg:npm/<scope>/<name>@<version>`
 * with the `@` of the scope segment URL-encoded as `%40`. Unscoped packages
 * are `pkg:npm/<name>@<version>`.
 *
 * @see https://github.com/package-url/purl-spec/blob/main/PURL-TYPES.rst#npm
 */
export function npmPurl(packageName: string, version: string): string {
  if (packageName.startsWith('@')) {
    const slashIdx = packageName.indexOf('/');
    if (slashIdx > 1) {
      const scope = packageName.slice(1, slashIdx);
      const name = packageName.slice(slashIdx + 1);
      return `pkg:npm/%40${scope}/${name}@${version}`;
    }
  }
  return `pkg:npm/${packageName}@${version}`;
}

/**
 * `node_modules/foo` → `foo`
 * `node_modules/@scope/example` → `@scope/example`
 * `node_modules/a/node_modules/b` → `b` (last segment after final node_modules/)
 */
function packageNameFromLockKey(key: string): string {
  const marker = 'node_modules/';
  const lastIdx = key.lastIndexOf(marker);
  if (lastIdx === -1) return key;
  return key.slice(lastIdx + marker.length);
}

function normalizeLicense(
  raw: string | { type?: string } | undefined,
): LicenseExpression | undefined {
  if (!raw) return undefined;
  const value = typeof raw === 'string' ? raw : raw.type;
  if (!value || value.length === 0) return undefined;
  // SPDX License List IDs are alphanumeric + a few separators. We cannot
  // round-trip arbitrary strings to spdxId without the full SPDX List on
  // hand, so the conservative split here is: assume the literal value is
  // the spdxId when it matches the conservative SPDX shape, else fall
  // back to `name` (per ADR-0005 — raw string when not canonicalizable).
  // The dedicated SPDX canonicalization helper lives in T-16 (spdx-2.3
  // emitter) per the layer boundary; for the parser, capture the source
  // string verbatim under spdxId so downstream layers can validate.
  return { spdxId: value };
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw) as T;
}

/**
 * Parse an npm project directory into an SbomIR.
 *
 * Reads `<projectDir>/package.json` and `<projectDir>/package-lock.json`.
 * Throws if either file is missing or unparseable (the dispatch layer at
 * T-12 catches and maps to `EX_DATAERR` for the CLI).
 */
export async function parseNpmProject(
  projectDir: string,
  options: NpmParseOptions = {},
): Promise<SbomIR> {
  const manifest = await readJson<NpmManifest>(
    join(projectDir, 'package.json'),
  );
  const lockfile = await readJson<NpmLockfile>(
    join(projectDir, 'package-lock.json'),
  );

  const rootName = manifest.name ?? lockfile.name ?? 'unknown-project';
  const rootVersion = manifest.version ?? lockfile.version ?? '0.0.0';
  const rootId = 'root';

  const rootComponent: Component = {
    id: rootId,
    purl: npmPurl(rootName, rootVersion),
    name: rootName,
    version: rootVersion,
    ecosystem: 'npm',
  };
  const rootLicense = normalizeLicense(manifest.license);
  if (rootLicense !== undefined) {
    rootComponent.license = rootLicense;
  }

  const components: Component[] = [rootComponent];
  const relationships: Relationship[] = [];

  const directProd = new Set(Object.keys(manifest.dependencies ?? {}));
  const directDev = new Set(Object.keys(manifest.devDependencies ?? {}));
  const directOptional = new Set(
    Object.keys(manifest.optionalDependencies ?? {}),
  );

  // npm v2/v3 lockfile: `packages` keys are paths relative to the project
  // root. The "" entry mirrors the project itself (root); subsequent keys
  // shaped `node_modules/...` are the resolved deps.
  const packages = lockfile.packages ?? {};
  for (const [key, entry] of Object.entries(packages)) {
    if (key === '') continue;
    const packageName = packageNameFromLockKey(key);
    if (entry.version === undefined) continue;

    const componentId = key;
    const license = normalizeLicense(entry.license);
    const component: Component = {
      id: componentId,
      purl: npmPurl(packageName, entry.version),
      name: packageName,
      version: entry.version,
      ecosystem: 'npm',
    };
    if (license !== undefined) {
      component.license = license;
    }
    components.push(component);

    // Only direct top-level deps (no nested node_modules) become root-edges.
    // Transitive (`node_modules/a/node_modules/b`) edges are emitted when
    // L2 grows nested-tree support (T-08 scope: depth-1 graph from root).
    const isTopLevel = !key.slice('node_modules/'.length).includes(
      'node_modules/',
    );
    if (!isTopLevel) continue;

    let relationshipType: Relationship['type'];
    if (directDev.has(packageName) || entry.dev === true) {
      relationshipType = 'dev-depends-on';
    } else if (
      directOptional.has(packageName) ||
      entry.optional === true
    ) {
      relationshipType = 'optional-depends-on';
    } else if (directProd.has(packageName)) {
      relationshipType = 'depends-on';
    } else {
      // Lockfile lists a top-level package the manifest does not declare —
      // possible during `npm install <pkg>` mid-state. Treat as a
      // production dep (the lockfile is the live source of truth).
      relationshipType = 'depends-on';
    }
    relationships.push({
      from: rootId,
      to: componentId,
      type: relationshipType,
    });
  }

  return {
    document: {
      namespace: options.namespace ?? `urn:sbom-pilot:npm:${rootName}@${rootVersion}`,
      createdAt: options.createdAt ?? new Date().toISOString(),
      creator: 'sbom-pilot',
      creatorVersion: options.creatorVersion ?? '0.0.0-dev',
      rootComponent: rootId,
    },
    components,
    relationships,
  };
}
