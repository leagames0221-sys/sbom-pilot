# decisionLog — sbom-pilot

> Index of architectural / scope / process decisions. Detailed rationale lives
> in `docs/adr/NNNN-*.md` per the ADR pattern; this file is the chronological
> index + 1-line summary.

## Decision index

| # | Date | Decision | ADR | Status |
| --- | --- | --- | --- | --- |
| D-001 | 2026-05-19 | Adopt 4-stage Spec-Driven Workflow (Discovery → Requirements EARS → Design → Tasks) | TBD | Active |
| D-002 | 2026-05-19 | License = MIT | (LICENSE) | Active |
| D-003 | 2026-05-19 | Initial commit PRIVATE, PUBLIC flip gated on verify | (CLAUDE.md) | Active |
| D-004 | 2026-05-19 | **Stack LOCKED = TypeScript** (user-approved single route, 1.5-day velocity + sibling reuse leverage) | [ADR-0002](../../docs/adr/0002-stack-typescript.md) | **Active** |
| D-005 | 2026-05-19 | Pre-commit hardening = base hooks + gitleaks (mask script wired at Stage 4) | (.pre-commit-config.yaml) | Active |
| D-006 | 2026-05-19 | **JP/US/EU compliance scope LOCKED = Cut A (4 全件)** = 改正個情法 26-2 + METI SBOM v2.0 + NTIA Minimum Elements + EU CRA Annex I | [ADR-0003](../../docs/adr/0003-compliance-reporter-format.md) | **Active** |
| D-011 | 2026-05-19 | **Stage 1.5 audit gate model LOCKED = user-review through** (Red flag 1 件でも → 採用見送り default, user explicit override required) | spec.md §9 Q3 | Active |
| D-012 | 2026-05-19 | **Phase α exit criteria LOCKED** | spec.md §7 + §9 Q4 | Active |
| D-013 | 2026-05-19 | **Credential-scrub rule MANDATORY** at all emitter boundaries (lesson from CVE-2025-65965 grype credential disclosure) — propagate to Stage 2 as AC-NF-credentials | ADR-0001 §Gate 6 | Active (pending Stage 2 EARS lock) |
| D-014 | 2026-05-19 | **syft + grype adoption shape = reference-only at design + opt-in subprocess (cosign-gated)** — pure TypeScript default, no external binary dependency baseline | [ADR-0001](../../docs/adr/0001-prior-art-audit.md) §Adoption shape | Active (user-cleared 2026-05-19) |
| D-015 | 2026-05-19 | **Stage 2 EARS LOCKED = 38 AC** across F-001 (8) + F-002 (7) + F-003 (8) + F-005 (5) + NF (10) | spec.md §10 | Active |
| D-016 | 2026-05-19 | **Compliance reporter format LOCKED = per-standard subcommand + vendored regulation snippets** | [ADR-0003](../../docs/adr/0003-compliance-reporter-format.md) | Active |
| D-017 | 2026-05-19 | **Vuln cache architecture LOCKED = offline-first OSV.dev bulk export + atomic temp-rename refresh + 30-day age warning** | [ADR-0004](../../docs/adr/0004-vuln-cache-architecture.md) | Active |
| D-018 | 2026-05-19 | **SBOM format support LOCKED = internal IR + dual emitter (SPDX 2.3 + CycloneDX 1.5)** | [ADR-0005](../../docs/adr/0005-sbom-format-ir.md) | Active |
| D-019 | 2026-05-19 | **Module boundary LOCKED = 5-layer (CLI → Emitters → IR ← Scanners ← Parsers) + dependency-cruiser CI gate** | [ADR-0006](../../docs/adr/0006-module-boundary.md) | Active |
| D-020 | 2026-05-19 | **Phase α exit gate LOCKED = Writer/Reviewer pattern + user gate** | [ADR-0007](../../docs/adr/0007-phase-alpha-exit-gate.md) | Active |
| D-007 | 2026-05-19 | paid-API 6-layer defense intact, sibling pattern inherit | (CLAUDE.md) | Active |
| D-008 | 2026-05-19 | LLM provider default = Ollama local `gemma3:4b`, mock fallback always available | (CLAUDE.md) | Active |
| D-009 | 2026-05-19 | Offline-first vuln DB cache, network egress opt-in via explicit `--refresh` flag | ADR-0003 (pending) | Open |
| D-010 | 2026-05-19 | Phase α exit gate = Writer/Reviewer pattern, user gate required | (CLAUDE.md) | Active |

## Drafted ADRs (Stage 3 deliverables, all Accepted 2026-05-19)

- **ADR-0001**: Prior-art adoption audit (syft + grype) — Stage 1.5 user-cleared
- **ADR-0002**: Stack = TypeScript + pnpm + vitest + commander + zod
- **ADR-0003**: Compliance reporter format — per-standard subcommand + vendored snippets
- **ADR-0004**: Vuln cache architecture — offline-first OSV.dev bulk export + atomic refresh
- **ADR-0005**: SBOM format support — internal IR + dual emitter
- **ADR-0006**: Module boundary — 5-layer + one-way dependency
- **ADR-0007**: Phase α exit gate — Writer/Reviewer + user gate

## Reversal log

(empty — no decisions reversed yet)

---

## D-021 2026-05-20 — Severity vocabulary relocated to IR leaf module (T-35 finding)

**Decision**: Move `OsvSeverityLabel` type + `SEVERITY_RANK` + `SEVERITY_DESC` + `compareSeverity` from `src/scanners/{vuln-db,severity}.ts` to a new leaf module `src/ir/severity.ts`.

**Context**: dependency-cruiser configured at T-35 caught a single ADR-0006 forbidden-edge violation: `src/emitters/compliance/appi-26-2.ts` was importing `rankBySeverity` as a VALUE from `src/scanners/severity.ts`, which crosses the forbidden Emitters→Scanners edge.

**Alternatives considered**:
- A. Pre-rank in the caller (CLI report subcommand) and remove appi-26-2's defensive internal rank call. Rejected: breaks the emitter's defensive contract (un-ranked input would produce wrong priority section ordering, breaking existing tests).
- B. Inline a 4-line sort in appi-26-2.ts using hard-coded ordering. Rejected: duplicate constants, prone to drift if severity vocab expands.
- C. depcruise per-rule exception annotation. Rejected: defeats the lint's purpose.
- **D. Move severity ordering primitives to a leaf module on the IR layer (selected)**. The vocab is pure data and the comparator is a pure function — both fit naturally on the IR layer, where any consumer (parsers, emitters, scanners, CLI) can reach them without crossing a forbidden edge. `rankBySeverity` (which operates on `Finding`, a scanners-domain type) stays in scanners.

**Outcome**: Edit landed in commit `f47435c`. Re-exports added from `src/scanners/vuln-db.ts` and `src/scanners/severity.ts` so the existing public surface of all callers stays valid (no breaking change). appi-26-2.ts now does `[...findings].sort((a, b) => compareSeverity(a.severity, b.severity))` using the IR-layer comparator, satisfying the no-emitters-to-scanners forbidden-edge rule. 16 existing tests for the appi emitter continue to pass; depcruise lint clean.

## D-022 2026-05-20 — cosign default-spawn wrapper re-throws spawnSync.error (T-40 polish finding)

**Decision**: `defaultCosignSpawn` (the production cosign invoker in `src/subprocess/cosign.ts`) inspects `result.error` after `spawnSync` and re-throws it.

**Context**: Round 1 reviewer CONFIRM held, but the writer self-audit caught a latent bug. The original wrapper returned `{status, stdout, stderr}` without inspecting `.error`. `child_process.spawnSync` does NOT throw on spawn failure (e.g., cosign not on PATH); it sets `result.error.code = 'ENOENT'` and leaves `status = null`. The outer `verifyAnchoreBinary` try/catch was written expecting the wrapper to throw, so a missing-cosign environment in production would have been mis-classified as a `signature-mismatch` instead of routing to the `cosign-missing` branch. The test suite did not catch this because all tests inject a stub `spawn` that throws (matching the outer try/catch contract).

**Fix**: `defaultCosignSpawn` now checks `if (result.error !== undefined && result.error !== null) throw result.error;`. An integration test (`__defaultCosignSpawnForTests` escape hatch) calls the real production wrapper against an intentionally-non-existent binary so the real `spawnSync` path is exercised in CI, not just the stub.

**Outcome**: Landed in commit `23e6c1b`. Production behaviour now matches the documented contract (`reason: 'cosign-missing'` returns when cosign is not on PATH); 7 cosign tests pass; cross-PJ universal lesson recorded (cross-process error contract in Node's spawnSync requires explicit `.error` inspection).
