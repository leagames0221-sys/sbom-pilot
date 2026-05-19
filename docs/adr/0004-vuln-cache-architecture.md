# ADR-0004: Vulnerability cache architecture — offline-first with atomic refresh

**Status**: Accepted
**Date**: 2026-05-19
**Stage**: 3 (Design)

## Context

Stage 2 §10.2 AC-002-2 mandates offline-first operation: scanning must work with zero outbound network calls when the cache exists. AC-002-3 permits an explicit `--refresh` opt-in. AC-NF-offline propagates this constraint as a non-functional requirement (verified by a fetch-interceptor test).

The vulnerability data source is OSV.dev (per ADR-0001 follow-up + spec.md §10.2 AC-002-1), which aggregates NVD + GHSA + ecosystem-specific advisories. OSV.dev publishes a downloadable [bulk export](https://google.github.io/osv.dev/data/) (zipped per-ecosystem JSON files, refreshed hourly).

## Decision

### Cache location

OS-appropriate user cache directory:

| OS | Path |
| --- | --- |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/sbom-pilot/vuln-db/` |
| macOS | `~/Library/Caches/sbom-pilot/vuln-db/` |
| Windows | `%LOCALAPPDATA%\sbom-pilot\vuln-db\` |

Path resolution uses `node:os.homedir()` + platform check; no environment variables hard-coded.

### Cache structure

```
vuln-db/
  manifest.json              # { version, fetchedAt, sourceUrl, sha256 }
  ecosystems/
    npm.jsonl                # one OSV record per line
    PyPI.jsonl
    Go.jsonl
    Maven.jsonl
    crates.io.jsonl
  index/
    by-purl.idx              # binary: purl → byte-offset into ecosystem jsonl
```

### Initial snapshot ship

The npm package includes a **minimal seed snapshot** (~10 MB compressed) at `dist/vuln-db-seed/` so the tool works immediately post-install without `--refresh`. The seed is regenerated nightly by a maintenance script (out of scope for Phase α) and committed via Dependabot-class PR.

### Atomic refresh

When `--refresh` is passed:

1. Download OSV.dev bulk export to a temp directory `${cacheRoot}/.tmp-<uuid>/`
2. Verify checksum against OSV.dev's published `sha256sums.txt`
3. Verify HTTPS TLS chain (Node default, no insecure flag)
4. Rename temp directory to `vuln-db.new`
5. Atomically swap: `vuln-db` → `vuln-db.old`, `vuln-db.new` → `vuln-db`
6. Delete `vuln-db.old`

If any step fails, the original `vuln-db` is preserved untouched.

### Age warning

When the cache `manifest.fetchedAt` is older than 30 days, print a warning to stderr suggesting `--refresh`. Do not block; let users explicitly accept staleness.

## Rationale

### Why OSV.dev as single source

- OSV.dev aggregates NVD + GHSA + ecosystem-specific (RustSec, GoVulnDB, PyPA, etc.) into one schema
- Run by Google with strong uptime and free public access
- Schema is open ([OSV schema spec](https://ossf.github.io/osv-schema/))
- Avoids 3 independent client implementations (NVD API + GHSA GraphQL + OSV REST)
- Free, no API key, no rate-limit for bulk export (only the live query API has rate limits)

### Why bulk export, not live query

- AC-002-2 requires zero network calls in default path
- Live query per component scales poorly (1k components = 1k requests = rate-limit risk)
- Bulk export is a deterministic snapshot; reproducible scans
- Bulk size (~50 MB per ecosystem, ~200 MB total) is acceptable for consumer laptop

### Why JSONL + binary purl index, not SQLite

- JSONL is git-friendly, line-oriented, parseable in chunks (no full-file load)
- Binary index (`by-purl.idx`) supports O(log n) lookups without loading entire DB
- SQLite would require schema migrations on every OSV.dev schema bump
- npm packaging is easier without a binary `.sqlite` file

### Why atomic temp-rename refresh

- Concurrent scan during refresh = no torn read (filesystem-level atomic rename)
- Failure mid-refresh = original cache intact, easy retry
- No need for file locks (which are platform-inconsistent on Windows)

## Alternatives considered

### Live OSV.dev API queries (rejected)

- **Pros**: always fresh, no cache management
- **Cons**: violates AC-002-2 offline-first; rate-limit risk; 1k components = 1k requests = slow
- **Why rejected**: violates locked Stage 2 requirements

### Embedded SQLite (rejected)

- **Pros**: rich query, transactions, mature
- **Cons**: binary file in npm package, native build per platform, schema migration burden
- **Why rejected**: free + no-CC + consumer-laptop constraint penalizes native bindings; JSONL+index is simpler

### Grype's own DB format (rejected)

- **Pros**: Anchore-curated quality
- **Cons**: opaque binary format, license attribution ambiguity for redistribution, locks us to a specific upstream's data shape
- **Why rejected**: opaqueness contradicts our auditability principle

## Tradeoffs accepted

| Tradeoff | Mitigation |
| --- | --- |
| Cache staleness possible | 30-day age warning + `--refresh` opt-in; document refresh cadence |
| Initial download is large (~200 MB on first refresh) | Ship seed snapshot at ~10 MB compressed; full refresh is opt-in |
| Binary index format is custom | Format-version field in `manifest.json`; reject mismatched versions with `EX_DATAERR` |

## Reversibility

The internal scanner interface accepts a `VulnDB` abstraction; switching to SQLite or a different aggregator later requires reimplementing one module (`src/scanners/vuln-db.ts`) without touching the scanner logic.

## References

- `spec.md` §10.2 (F-002 AC list) + §10.5.3 (AC-NF-offline)
- OSV.dev bulk export: `https://google.github.io/osv.dev/data/`
- OSV schema: `https://ossf.github.io/osv-schema/`
- Node atomic rename pattern: `https://nodejs.org/api/fs.html#fspromisesrenameoldpath-newpath`
