# ADR-0002: Stack = TypeScript (Node.js 20 LTS) + pnpm + vitest + commander + zod

**Status**: Accepted (Stage 1 user-approved 2026-05-19, propagated to Stage 3)
**Date**: 2026-05-19
**Author**: tomohiro takada (`leagames0221-sys`)
**Stage**: 3 (Design)

## Context

The implementation language and runtime stack drive every downstream choice (test framework, CLI parser, schema validator, dependency hygiene tooling, distribution channel). Stage 1 Discovery (`spec.md` §5) evaluated TypeScript vs Go and the user explicitly approved TypeScript as the single route.

## Decision

| Layer | Selection | Free + no-CC verified |
| --- | --- | --- |
| Language | TypeScript (strict mode) | ✅ |
| Runtime | Node.js 20 LTS minimum (enforced via `engines.node` + `.npmrc engine-strict=true`) | ✅ |
| Package manager | pnpm (lockfile committed, `pnpm install --frozen-lockfile` in CI) | ✅ |
| Test framework | vitest (ESM native, TS first-class, snapshot built-in) | ✅ |
| CLI parser | commander (Apache-2.0 / MIT compatible, ~10k+ stars, mature) | ✅ |
| Schema / runtime validation | zod (MIT, widely adopted) | ✅ |
| Distribution | npm package + standalone binary via `pkg` or `bun build --compile` (final cut at Stage 4) | ✅ free path |
| CI | GitHub Actions free tier (3-OS matrix: Ubuntu / macOS / Windows) | ✅ free tier 2,000 min/mo |
| LLM runtime (optional) | Ollama local `gemma3:4b` (default `localhost:11434`); mock fallback when Ollama unavailable | ✅ free, no CC |

## Rationale

### Velocity (~1.5 days vs ~3 days)

Estimated time-to-Phase-α was ~1.5 days for TypeScript and ~3 days for Go in Stage 1 Discovery. The differential is dominated by sibling reusable patterns being TypeScript-native; in a Go pivot they would need re-implementation. Source: `spec.md` §5.1 / §5.2.

### Sibling reusable patterns (~1500 LOC equivalent)

Generic patterns proven in adjacent prior work that map cleanly to `sbom-pilot`:

- SARIF v2.1.0 emitter (atomic temp-rename writer + schema gate)
- sysexits-aligned CLI exit code module
- Sequential probe runner with `AbortSignal` propagation
- Channel B forbidden-token mask pre-commit hook
- paid-API 6-layer defense (constructor gate + pre-flight reserve + key mask + CI fetch trap + default mock + no-CC service constraint)
- ADR-driven design log convention
- Cline 5-file memory bank pattern

These do not require Anchore prior-art attribution (they are independent generic patterns), but the implementation idiom transfers literally.

### SBOM library coverage gap is bounded

The known TS-ecosystem gap (CycloneDX 1.5 emission lagging v1.6 in [`@cyclonedx/cyclonedx-library`](https://www.npmjs.com/package/@cyclonedx/cyclonedx-library)) is bounded by:

- The official CycloneDX 1.5 JSON schema is publicly vendored; manual JSON construction + zod schema validation covers the gap in < 100 LOC of emitter code.
- SPDX 2.3 has [`spdx-license-ids`](https://www.npmjs.com/package/spdx-license-ids) for ID validation; the document shape itself is JSON Schema-driven, same pattern as CycloneDX.

### Subprocess wrap of syft/grype is a documented pattern

When `--use-syft` / `--use-grype` is opted-in, the binary is spawned as a subprocess and its stdout parsed. This is the same pattern used by Trivy when invoking external tools, and is not novel risk. The cosign-signature gate (AC-NF-cosign-gate) mitigates supply-chain compromise of the local binary.

## Alternatives considered

### Go (rejected)

- **Pros**: native `anchore/syft` + `anchore/grype` library import (no subprocess), mature `spdx/tools-golang`, single-binary deploy
- **Cons**: zero sibling reuse, ~3-day implementation, npm-distribution path lost, new test framework and CI matrix learning cost
- **Why rejected**: 1.5-day differential is decisive at the user-stated 1–2 day target timeline.

### Rust (not formally considered)

- **Pros**: best supply-chain hygiene story (cargo + crev), strong type system, single-binary deploy
- **Cons**: no sibling reuse, smaller talent overlap in target audience (individual JP/SMB devs more likely on Node than Rust), longer implementation
- **Why not selected**: did not pass even the initial Discovery filter (no decomposed prior art seed in the language).

## Tradeoffs accepted

| Tradeoff | Mitigation |
| --- | --- |
| Loss of Go-native SBOM library ecosystem | Vendor SPDX/CycloneDX JSON schemas, validate emissions via zod + ajv |
| Subprocess overhead for opt-in syft/grype path | Default path = pure TypeScript (no subprocess); opt-in is explicit user choice |
| Node-version churn (LTS cycle) | Pin Node 20 LTS minimum until 2026-04 EOL; bump to 22 LTS post-EOL |
| npm supply-chain attack surface (Shai-Hulud class) | Lockfile committed, `pnpm install --frozen-lockfile`, audit-gate at CI (`pnpm audit --audit-level=high`), `onlyBuiltDependencies=[]` to block postinstall scripts |

## Reversibility

If TypeScript proves unworkable post-Phase α (e.g. distribution friction, performance ceiling on 100k+ component SBOMs, or community signal pivots strongly toward Go), reimplementation to Go is feasible at ~3-day cost. The intermediate representation (IR) defined in ADR-0005 is language-agnostic and would transfer.

## Compliance with free-+-no-CC constraint

All selected stack components have a free tier sufficient for the project's usage:

- Node.js / pnpm / vitest / commander / zod = OSS, free
- GitHub Actions free tier (public repo, 2,000 min/mo private) is sufficient for the planned CI matrix
- Ollama = local, no service required, no CC
- No paid LLM API in any default path (AC-NF-1..5 enforce)

## References

- `spec.md` §5 (Stack judgment), §5.3 (Locked decision)
- `spec.md` §10.5.1 (paid-API 6-layer defense AC list)
- `ADR-0001` §Adoption shape (subprocess + cosign gate for syft/grype)
