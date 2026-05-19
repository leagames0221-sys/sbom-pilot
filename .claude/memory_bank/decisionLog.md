# decisionLog — sbom-pilot

> Index of architectural / scope / process decisions. Detailed rationale lives
> in `docs/adr/NNNN-*.md` per the ADR pattern; this file is the chronological
> index + 1-line summary.

## Decision index

| # | Date | Decision | ADR | Status |
| --- | --- | --- | --- | --- |
| D-001 | 2026-05-19 | Adopt 4-stage Spec-Driven Workflow (Discovery → Requirements EARS → Design → Tasks) | TBD | Active |
| D-002 | 2026-05-19 | License = MIT | (LICENSE) | Active |
| D-003 | 2026-05-19 | Channel B framing strict, initial commit PRIVATE, PUBLIC flip gated on canonical tier verify | (CLAUDE.md) | Active |
| D-004 | 2026-05-19 | **Stack LOCKED = TypeScript** (user-approved single route, 1.5-day velocity + sibling reuse leverage) | [ADR-0002](../../docs/adr/0002-stack-typescript.md) | **Active** |
| D-005 | 2026-05-19 | Pre-commit hardening = base hooks + gitleaks + forbidden-token-mask (mask script wired at Stage 4) | (.pre-commit-config.yaml) | Active |
| D-006 | 2026-05-19 | **JP/US/EU compliance scope LOCKED = Cut A (4 全件)** = 改正個情法 26-2 + METI SBOM v2.0 + NTIA Minimum Elements + EU CRA Annex I | [ADR-0003](../../docs/adr/0003-compliance-reporter-format.md) | **Active** |
| D-011 | 2026-05-19 | **Stage 1.5 audit gate model LOCKED = user-review through** (Red flag 1 件でも → 採用見送り default, user explicit override required) | spec.md §9 Q3 | Active |
| D-012 | 2026-05-19 | **Phase α exit criteria LOCKED = 7-binary full apply** (canonical tier rubric, scoped subset rejected) | spec.md §7 + §9 Q4 | Active |
| D-013 | 2026-05-19 | **Credential-scrub rule MANDATORY** at all emitter boundaries (lesson from CVE-2025-65965 grype credential disclosure) — propagate to Stage 2 as AC-NF-credentials | ADR-0001 §Gate 6 | Active (pending Stage 2 EARS lock) |
| D-014 | 2026-05-19 | **syft + grype adoption shape = reference-only at design + opt-in subprocess (cosign-gated)** — pure TypeScript default, no external binary dependency baseline | [ADR-0001](../../docs/adr/0001-prior-art-audit.md) §Adoption shape | Active (user-cleared 2026-05-19) |
| D-015 | 2026-05-19 | **Stage 2 EARS LOCKED = 38 AC** across F-001 (8) + F-002 (7) + F-003 (8) + F-005 (5) + NF (10) | spec.md §10 | Active |
| D-016 | 2026-05-19 | **Compliance reporter format LOCKED = per-standard subcommand + vendored regulation snippets** | [ADR-0003](../../docs/adr/0003-compliance-reporter-format.md) | Active |
| D-017 | 2026-05-19 | **Vuln cache architecture LOCKED = offline-first OSV.dev bulk export + atomic temp-rename refresh + 30-day age warning** | [ADR-0004](../../docs/adr/0004-vuln-cache-architecture.md) | Active |
| D-018 | 2026-05-19 | **SBOM format support LOCKED = internal IR + dual emitter (SPDX 2.3 + CycloneDX 1.5)** | [ADR-0005](../../docs/adr/0005-sbom-format-ir.md) | Active |
| D-019 | 2026-05-19 | **Module boundary LOCKED = 5-layer (CLI → Emitters → IR ← Scanners ← Parsers) + dependency-cruiser CI gate** | [ADR-0006](../../docs/adr/0006-module-boundary.md) | Active |
| D-020 | 2026-05-19 | **Phase α exit gate LOCKED = Writer/Reviewer pattern + 7-binary canonical rubric + user gate (AI self-promotion forbidden)** | [ADR-0007](../../docs/adr/0007-phase-alpha-exit-gate.md) | Active |
| D-007 | 2026-05-19 | paid-API 6-layer defense intact, sibling pattern inherit | (CLAUDE.md) | Active |
| D-008 | 2026-05-19 | LLM provider default = Ollama local `gemma3:4b`, mock fallback always available | (CLAUDE.md) | Active |
| D-009 | 2026-05-19 | Offline-first vuln DB cache, network egress opt-in via explicit `--refresh` flag | ADR-0003 (pending) | Open |
| D-010 | 2026-05-19 | Phase α exit gate = Writer/Reviewer pattern with canonical 7-binary rubric, AI self-promotion forbidden, user gate required | (CLAUDE.md) | Active |

## Drafted ADRs (Stage 3 deliverables, all Accepted 2026-05-19)

- **ADR-0001**: Prior-art adoption audit (syft + grype) — Stage 1.5 user-cleared
- **ADR-0002**: Stack = TypeScript + pnpm + vitest + commander + zod
- **ADR-0003**: Compliance reporter format — per-standard subcommand + vendored snippets
- **ADR-0004**: Vuln cache architecture — offline-first OSV.dev bulk export + atomic refresh
- **ADR-0005**: SBOM format support — internal IR + dual emitter
- **ADR-0006**: Module boundary — 5-layer + one-way dependency
- **ADR-0007**: Phase α exit gate — Writer/Reviewer + 7-binary rubric + user gate

## Reversal log

(empty — no decisions reversed yet)
