/**
 * pnpm parser — pnpm-lock.yaml + package.json → SbomIR.
 *
 * Reads a project directory containing a pnpm v9 lockfile and produces a
 * populated SbomIR. Direct top-level deps from `importers['.']` become
 * root-edge Relationships; deeper transitive packages live in the
 * `packages` section and are emitted as Components with no root-edge
 * (their edges land in deeper graph work outside T-09 scope).
 *
 * Per ADR-0006 module boundary: Layer 1, writes only to the IR.
 *
 * pnpm-lock.yaml v9 schema notes:
 *   - The `packages` section omits the `license` field that npm's
 *     package-lock.json carries — pnpm tracks license metadata only in the
 *     installed node_modules tree. Components emitted from the lockfile
 *     therefore land without `license` populated. AC-001-7 is conditional
 *     ("WHEN ... known"), so absence is acceptable; a future enrichment
 *     pass (registry lookup or node_modules walk) can backfill.
 *   - Package keys are shaped `name@version` (unscoped) or
 *     `@scope/name@version` (scoped). pnpm sometimes appends
 *     `(peer-dep@x.y.z)` suffixes; we strip those before splitting.
 *
 * Spec mapping:
 *   - AC-001-1 (manifest detection + ingest for pnpm projects)
 *   - ADR-0005 §Decision (IR shape)
 *   - ADR-0006 §Dependency direction (parsers → IR only)
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  Component,
  Relationship,
  SbomIR,
} from '../ir/index.js';
import { npmPurl } from './npm.js';
import type { NpmParseOptions } from './npm.js';

interface ProjectManifest {
  name?: string;
  version?: string;
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface PnpmImporterDepEntry {
  specifier?: string;
  version?: string;
}

interface PnpmImporter {
  dependencies?: Record<string, PnpmImporterDepEntry>;
  devDependencies?: Record<string, PnpmImporterDepEntry>;
  optionalDependencies?: Record<string, PnpmImporterDepEntry>;
}

interface PnpmPackageEntry {
  resolution?: { integrity?: string; tarball?: string };
  engines?: Record<string, string>;
  hasBin?: boolean;
}

interface PnpmLockfile {
  lockfileVersion?: string;
  importers?: Record<string, PnpmImporter>;
  packages?: Record<string, PnpmPackageEntry>;
}

/**
 * Split a pnpm v9 package-key into `{ name, version }`.
 *
 *   `lodash@4.17.21`                  → { lodash, 4.17.21 }
 *   `@scope/example@1.0.0`            → { @scope/example, 1.0.0 }
 *   `react@18.2.0(react-dom@18.2.0)`  → { react, 18.2.0 } (peer suffix stripped)
 *
 * Returns null for malformed keys (caller skips them).
 */
export function parsePnpmPackageKey(
  key: string,
): { name: string; version: string } | null {
  const cleaned = key.replace(/\([^)]*\)$/, '');
  const isScoped = cleaned.startsWith('@');
  const splitAt = isScoped
    ? cleaned.indexOf('@', 1)
    : cleaned.indexOf('@');
  if (splitAt <= 0) return null;
  const name = cleaned.slice(0, splitAt);
  const version = cleaned.slice(splitAt + 1);
  if (name.length === 0 || version.length === 0) return null;
  // Scoped packages must have the `@scope/name` shape — the name portion
  // before the version-@ must contain a slash. `@@1.0.0` and similar
  // malformed scope-only keys are rejected here.
  if (isScoped && !name.includes('/')) return null;
  return { name, version };
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, 'utf8');
  return JSON.parse(raw) as T;
}

async function readYaml<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, 'utf8');
  return parseYaml(raw) as T;
}

/**
 * Parse a pnpm project directory into an SbomIR.
 *
 * Reads `<projectDir>/package.json` and `<projectDir>/pnpm-lock.yaml`.
 * Throws if either file is missing or unparseable.
 */
export async function parsePnpmProject(
  projectDir: string,
  options: NpmParseOptions = {},
): Promise<SbomIR> {
  const manifest = await readJson<ProjectManifest>(
    join(projectDir, 'package.json'),
  );
  const lockfile = await readYaml<PnpmLockfile>(
    join(projectDir, 'pnpm-lock.yaml'),
  );

  const rootName = manifest.name ?? 'unknown-project';
  const rootVersion = manifest.version ?? '0.0.0';
  const rootId = 'root';

  const rootComponent: Component = {
    id: rootId,
    purl: npmPurl(rootName, rootVersion),
    name: rootName,
    version: rootVersion,
    ecosystem: 'npm',
  };
  if (manifest.license !== undefined && manifest.license.length > 0) {
    rootComponent.license = { spdxId: manifest.license };
  }

  const components: Component[] = [rootComponent];
  const relationships: Relationship[] = [];

  const rootImporter = lockfile.importers?.['.'] ?? {};
  const directProd = new Set(Object.keys(rootImporter.dependencies ?? {}));
  const directDev = new Set(Object.keys(rootImporter.devDependencies ?? {}));
  const directOptional = new Set(
    Object.keys(rootImporter.optionalDependencies ?? {}),
  );

  for (const [key] of Object.entries(lockfile.packages ?? {})) {
    const parsed = parsePnpmPackageKey(key);
    if (parsed === null) continue;
    const { name, version } = parsed;

    const componentId = key;
    const component: Component = {
      id: componentId,
      purl: npmPurl(name, version),
      name,
      version,
      ecosystem: 'npm',
    };
    components.push(component);

    let relationshipType: Relationship['type'] | null = null;
    if (directDev.has(name)) {
      relationshipType = 'dev-depends-on';
    } else if (directOptional.has(name)) {
      relationshipType = 'optional-depends-on';
    } else if (directProd.has(name)) {
      relationshipType = 'depends-on';
    }
    if (relationshipType !== null) {
      relationships.push({
        from: rootId,
        to: componentId,
        type: relationshipType,
      });
    }
  }

  return {
    document: {
      namespace:
        options.namespace ?? `urn:sbom-pilot:pnpm:${rootName}@${rootVersion}`,
      createdAt: options.createdAt ?? new Date().toISOString(),
      creator: 'sbom-pilot',
      creatorVersion: options.creatorVersion ?? '0.0.0-dev',
      rootComponent: rootId,
    },
    components,
    relationships,
  };
}
