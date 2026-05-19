# activeContext — sbom-pilot

> Current session focus + immediate next action. Update at the end of every session.

## Current phase

**Stage 1.5 — Prior-art adoption audit** (Stage 1 Discovery approved 2026-05-19, locked decisions Cut A + TypeScript + user-review through gate + 7-binary full apply)

## Current focus

- ADR-0001 drafted: syft + grype both 8/8 gates PASS = Adopt verdict
- Adoption shape locked: reference-only at design + opt-in subprocess with cosign gate (default = pure TypeScript, no external binary dependency)
- Domain lesson captured from CVE-2025-65965: credential-scrub mandatory at all emitter boundaries (propagate to Stage 2 EARS as AC-NF-credentials)

## Immediate next action

1. Commit ADR-0001 + push
2. User review gate on ADR-0001 (4 explicit ✅/❌ items, see ADR §User review gate)
3. Stage 2 Requirements (EARS) drafting after clearance

## Open questions for user

- Awaiting Stage 1.5 ADR review (no new questions at this gate; user decision is Adopt / Adopt-with-mitigations / Reject per tool)

## Recently completed (this session)

- PJ root scaffolding (LICENSE / SECURITY / .gitignore / .pre-commit / .editorconfig / README stub / CLAUDE.md Tier 2)
- `.claude/memory_bank/` 5-file initialization
- Git init + channel B identity config
- Initial commit `4310167` pushed to `leagames0221-sys/sbom-pilot` PRIVATE
- **Stage 1 Discovery user approve gate cleared 2026-05-19** — 4 decisions locked: Cut A (4-regulation compliance) + TypeScript single-route + user-review through Stage 1.5 + 7-binary full apply

## Blocked / waiting on

- User review gate for Stage 1.5 ADR-0001 (prior-art adoption audit)

## Related session handoff

- Cold-start handoff: stored on local Desktop (per session log, gitignored)
- Prior PJ (security tool #1) completion SSoT: tracked in internal session memory
