# activeContext — sbom-pilot

> Current session focus + immediate next action. Update at the end of every session.

## Current phase

**Stage 1 Discovery** (internal Spec-Driven Workflow, 4-stage: Discovery → Requirements EARS → Design → Tasks)

## Current focus

- Drafting `spec.md` as the Stage 1 Discovery output:
  - syft + grype prior-art audit (Scorecard + license + signed releases + stars)
  - Competitor matrix (Trivy / dependency-track / OSV-Scanner / cyclonedx-cli)
  - Differentiation axis (JP-compliance-first + offline-first + sibling to internal security tool #1)
  - Stack judgment (TypeScript vs Go, locked at this stage)
  - Scope 1-line declaration + Boundary/Forbidden/Depends 3-bucket file structure plan
  - Phase 1 (Phase α) acceptance gate definition (AC-α-1..AC-α-N)

## Immediate next action

1. Push initial commit to `leagames0221-sys/sbom-pilot` PRIVATE
2. User approve gate for Stage 1 Discovery `spec.md`
3. Stage 2 Requirements (EARS) drafting after approve

## Open questions for user

- Stack final lock: TypeScript (default, sibling reuse from internal security tool #1) vs Go (syft/grype native)
- JP-compliance scope: 改正個情法 + METI v2.0 のみ vs + NTIA + EU CRA 全件
- Phase α exit criteria: 7-binary tier rubric full apply or scoped subset

## Recently completed (this session)

- PJ root scaffolding (LICENSE / SECURITY / .gitignore / .pre-commit / .editorconfig / README stub / CLAUDE.md Tier 2)
- `.claude/memory_bank/` 5-file initialization
- Git init + channel B identity config

## Blocked / waiting on

- User approve gate for Stage 1 Discovery

## Related session handoff

- Cold-start handoff: stored on local Desktop (per session log, gitignored)
- Prior PJ (security tool #1) completion SSoT: tracked in internal session memory
