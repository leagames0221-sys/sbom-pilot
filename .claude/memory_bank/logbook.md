# logbook — sbom-pilot

> Chronological session log. One entry per session, append-only.
> Format: `## YYYY-MM-DD — <session focus>` + bullet list of actions + outcomes.

## 2026-05-19 — PJ scaffold + Stage 1 Discovery kickoff

- Project initialization following the 5-step Tier 2 install protocol (PROJECT_TEMPLATE pattern, 5-minute setup target)
- Files landed:
  - `LICENSE` (MIT, © 2026 tomohiro takada)
  - `SECURITY.md` (defensive-first posture + GitHub Security Advisories disclosure + scope/hardening)
  - `.gitignore` (Node + Go + secrets + SBOM artifacts + channel B mask + telemetry)
  - `.pre-commit-config.yaml` (gitleaks + base hooks + forbidden-token-mask hook wired for Stage 4)
  - `.editorconfig` (cross-OS normalization, Go-specific tab override)
  - `CLAUDE.md` (Tier 2 PJ-local rules, stack TBD pending Discovery)
  - `README.md` (initial scope statement + Stage 1 Discovery in-progress framing)
  - `.claude/internal_notes.md` (gitignored channel B mask list)
  - `.claude/memory_bank/{activeContext,logbook,decisionLog,productContext,systemPatterns}.md` (Cline 5-file pattern)
- Git initialized with `main` branch, channel B identity configured (`tomohiro takada <263370648+leagames0221-sys@users.noreply.github.com>`)
- Stack decision deferred to Stage 1 Discovery ADR-0001 (TypeScript vs Go evaluation)
- Phase α exit criteria draft: 7 binary criteria from the canonical tier rubric, full apply (no scope reduction)
- Next: initial commit + GitHub PRIVATE repo create + Stage 1 Discovery `spec.md` drafting → user approve gate

## 2026-05-19 — Stage 1 approve gate cleared + Stage 1.5 kickoff

- User reviewed `spec.md` and approved all 4 questions at recommended single-route:
  - Q1 Compliance scope: Cut A (改正個情法 + METI + NTIA + EU CRA 4 全件) ✅ LOCKED
  - Q2 Stack: TypeScript single-route ✅ LOCKED
  - Q3 Stage 1.5 audit gate model: user-review through (Red flag → 採用見送り default) ✅ LOCKED
  - Q4 Phase α exit: 7-binary full apply ✅ LOCKED
- `spec.md` §4.5 / §5.3 / §9 updated with LOCKED markers + rationale
- `decisionLog.md` D-004 + D-006 moved Open → Active, D-011 + D-012 added
- Stage 1.5 ADR-0001 (`docs/adr/0001-prior-art-audit.md`) drafting kickoff: 8 gate items × 2 tools (syft + grype) = 16 evidence cells

### Stage 1.5 evidence collected (literal, gh API + scorecard.dev API, 2026-05-19)

- syft: Scorecard 8.0, Apache-2.0, cosign-signed releases (v1.44.0, 2026-05-01), pushed_at 2026-05-18, 8,955 stars, no high/critical CVE, Dependabot + go.sum committed, no red-flag patterns
- grype: Scorecard 8.2, Apache-2.0, cosign-signed releases (v0.112.0, 2026-05-01), pushed_at 2026-05-18, 12,234 stars, GHSA-6gxw-85q2-q646 (CVE-2025-65965, HIGH) **resolved in v0.104.1** (current v0.112.0 is 8 versions past fix), Dependabot + go.sum committed, no red-flag patterns
- Both tools = 8/8 gates PASS = Adopt verdict
- Domain lesson captured: CVE-2025-65965 credential-disclosure pattern → AC-NF-credentials mandatory in Stage 2 EARS (D-013 added to decisionLog)
- Adoption shape: reference-only at design + opt-in subprocess with cosign verification (D-014)

### Carry-over for next session

- Awaiting user review gate on ADR-0001 (4 explicit ✅/❌ items at the end of the ADR)
- After clearance: Stage 2 Requirements (EARS-formatted F-001..F-005 + NF-N) drafting
