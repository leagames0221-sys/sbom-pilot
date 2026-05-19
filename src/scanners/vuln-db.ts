/**
 * Vulnerability-database cache: load, age-check, atomic refresh.
 *
 * The cache file is a single JSON document under a caller-supplied path
 * (default convention: `<project>/.sbom-pilot/vuln-db.json` or
 * `~/.sbom-pilot/vuln-db.json`). The cache shape wraps a metadata block
 * and an array of OSV-schema vulnerability records — the canonical
 * vendor-neutral schema published by the OSSF
 * (https://ossf.github.io/osv-schema/).
 *
 * Per ADR-0004 (vuln cache architecture) the cache is **offline-first**:
 * `loadVulnDb()` reads from disk and never touches the network. Refresh
 * is an explicit operation performed by `scripts/refresh_vuln_db.ts`
 * (which lands at T-29 along with the CLI), invoked only when the user
 * passes `--refresh` to the `scan` subcommand. AC-NF-offline is upheld
 * structurally — the loader has no `fetch` import path.
 *
 * Per ADR-0006 §Decision: Layer 3 (Scanners). Reads its own cache file
 * via `fs.readFile`. No imports from emitters, parsers, or CLI.
 *
 * Spec mapping: AC-002-2, AC-002-3, AC-NF-offline, ADR-0004, ADR-0005,
 * ADR-0006.
 */
import { promises as fs } from 'node:fs';
import { atomicWrite } from '../util/atomic-write.js';

/**
 * One range entry inside an {@link OsvAffected.ranges} array. The OSV
 * schema describes the affected version window via an event list:
 * `introduced` / `fixed` / `last_affected` / `limit` markers ordered by
 * their position in semver space. Phase α only honours `introduced` +
 * `fixed`; `last_affected` is treated equivalently to `fixed` and
 * `limit` is informational.
 */
export interface OsvRangeEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface OsvRange {
  type: 'SEMVER' | 'ECOSYSTEM' | 'GIT';
  events: OsvRangeEvent[];
}

export interface OsvPackage {
  name: string;
  ecosystem: string;
  purl?: string;
}

export interface OsvAffected {
  package: OsvPackage;
  ranges?: OsvRange[];
  versions?: string[];
}

export interface OsvSeverity {
  type: string;
  score: string;
}

export type OsvSeverityLabel =
  | 'CRITICAL'
  | 'HIGH'
  | 'MODERATE'
  | 'LOW'
  | 'UNKNOWN';

export interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified?: string;
  published?: string;
  affected: OsvAffected[];
  references?: Array<{ type: string; url: string }>;
  severity?: OsvSeverity[];
  database_specific?: {
    severity?: OsvSeverityLabel | string;
    [key: string]: unknown;
  };
}

export interface VulnDbMetadata {
  schemaVersion: string;
  lastUpdated: string;
  advisoryCount: number;
  source?: string;
}

export interface VulnDbCache {
  metadata: VulnDbMetadata;
  advisories: OsvVulnerability[];
}

/**
 * Load a vuln-db cache from disk. Throws if the file is missing,
 * unreadable, or the JSON shape is structurally invalid (missing
 * `metadata` block or non-array `advisories`).
 *
 * Validation is intentionally minimal at T-18 scope: structural keys
 * only, not OSV-schema-deep. Deeper schema validation can be added at
 * T-19 when correlator consumers can fail soft on malformed records.
 */
export async function loadVulnDb(path: string): Promise<VulnDbCache> {
  const raw = await fs.readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('metadata' in parsed) ||
    !('advisories' in parsed)
  ) {
    throw new Error(
      `Vuln-db cache at ${path} is missing required top-level keys (metadata, advisories)`,
    );
  }
  const record = parsed as { metadata: unknown; advisories: unknown };
  if (!Array.isArray(record.advisories)) {
    throw new Error(
      `Vuln-db cache at ${path} has non-array advisories field`,
    );
  }
  return record as unknown as VulnDbCache;
}

/**
 * Default age threshold (in days) beyond which {@link isVulnDbStale}
 * returns true. AC-002-3 mandates a warning at >30 days; the default
 * matches.
 */
export const DEFAULT_MAX_AGE_DAYS = 30;

/**
 * Determine whether the cache is older than `maxAgeDays` based on its
 * `metadata.lastUpdated` field. `now` is injectable for deterministic
 * tests; defaults to `new Date()`.
 *
 * Returns true also when `lastUpdated` is unparseable — better to nag
 * the user about a suspicious cache than to silently swallow it.
 */
export function isVulnDbStale(
  cache: VulnDbCache,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
  now: Date = new Date(),
): boolean {
  const updated = Date.parse(cache.metadata.lastUpdated);
  if (Number.isNaN(updated)) return true;
  const ageMs = now.getTime() - updated;
  const maxMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return ageMs > maxMs;
}

/**
 * Return a human-readable warning string when the cache is stale,
 * otherwise return null. Intended for CLI stderr output (`scan`
 * subcommand emits this before findings).
 */
export function formatStalenessWarning(
  cache: VulnDbCache,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
  now: Date = new Date(),
): string | null {
  if (!isVulnDbStale(cache, maxAgeDays, now)) return null;
  const updated = cache.metadata.lastUpdated;
  return `warning: vuln-db cache last updated ${updated} (older than ${maxAgeDays} days). Run \`sbom-pilot scan --refresh\` to pull a fresh copy.`;
}

/**
 * Atomically replace the on-disk cache at `path` with the serialised
 * form of `cache`. Delegates to `atomicWrite` from src/util/ so a
 * mid-write process kill leaves the prior cache intact (AC-002-7
 * applies — refresh must never corrupt the cache).
 *
 * Returns the bytes written for caller logging.
 */
export async function writeVulnDb(
  path: string,
  cache: VulnDbCache,
): Promise<string> {
  const content = JSON.stringify(cache, null, 2) + '\n';
  await atomicWrite(path, content);
  return content;
}
