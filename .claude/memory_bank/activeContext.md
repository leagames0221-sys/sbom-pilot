# activeContext — sbom-pilot

> Current session focus + immediate next action. Update at the end of every session.

## Current phase

**Phase 1 implementation — L0..L8 COMPLETE 2026-05-20** (32 / 40 tasks, 80%). Stage 4 user-cleared. Next: L9 Verify (T-33..T-40, 8 tasks).

## Layer-by-layer completion summary (32 commits on main)

| Layer | Tasks | Commits |
|---|---|---|
| L0 Foundation (4) | T-01..T-04 | c8bebcc / bfc9b06 / 96034f5 / a66db93 |
| L1 IR (3) | T-05..T-07 | 851e849 / 4201152 / c853756 (+ L1-closure f02d4cb) |
| L2 Parsers (5) | T-08..T-12 | 73fa1ff / c69f126 (+ yaml dep) / 8adfc36 / 7b7fd59 / 2f4a1c4 |
| L3 Schemas (2) | T-13..T-14 | dc57bf0 (+ ajv+ajv-formats deps) / f5fb3fd |
| L4 SBOM Emitters (3) | T-15..T-17 | 5620d57 / 21f0ca4 / 208b0b0 |
| L5 Scanning+SARIF (4) | T-18..T-21 | d44460c / 7be064a / cb31947 / f7c9140 |
| L6 Compliance (5) | T-22..T-26 | 95fb3c8 / 125cf0e / 8cd119a / 80bbe28 / ef6c660 |
| L7 LLM Providers (2) | T-27..T-28 | b77baa5 / 88bad62 |
| L8 CLI (4) | T-29..T-32 | 06a21fe / 8ff0220 / 2697b42 / 35bcb54 |

Plus a parallel-session vitest bump landed at `2791a47` (vitest 2.1.x → 3.2.4, between T-11 and T-12).

## Verify state at end of L8

main HEAD = origin/main = **`35bcb54`** (2026-05-20)
- **578 specs PASS** in 42 files
- `pnpm typecheck` exit 0 (tsc strict + exactOptionalPropertyTypes)
- `pnpm audit --audit-level=high` clean
- Working tree clean
- All 4 CLI subcommands wired end-to-end (sbom / scan / report / suggest)
- End-to-end pipeline exercised by tests/e2e/scan.test.ts (12 of 21 shipped modules)

## Runtime dependencies adopted (with prior-art security audit per project rule)

| Dep | Pinned | Audited | Adopted-at |
|---|---|---|---|
| commander | ^13.0.0 | (L0 default with stack) | T-01 |
| zod | ^3.23.8 | (L0 default with stack) | T-01 |
| yaml (eemeli/yaml) | ^2.9.0 | 8-item audit: green 6, yellow 2 mitigated | T-09 |
| ajv (ajv-validator/ajv) | ^8.20.0 | 8-item audit: green 5, yellow 2 mitigated | T-13 |
| ajv-formats | ^3.0.1 | 8-item audit: green 4, yellow 3 mitigated (Maintained 0 = feature-frozen plugin, 91M weekly downloads, 0 CVE history) | T-13 |

## Immediate next action

L9 Verify (T-33..T-40, 8 tasks):
1. T-33 — `.github/workflows/ci.yml` (3-OS matrix Linux/macOS/Windows + audit + drift-check)
2. T-34 — `.github/workflows/{scorecard,codeql}.yml` + `.github/dependabot.yml`
3. T-35 — `.dependency-cruiser.cjs` (Layer boundary lint per ADR-0006) + tests/unit/lint/
       — **new dep adoption**: `dependency-cruiser` — requires prior-art security audit + user OK gate before install
4. T-36 — `NOTICE` file (Apache-2.0 attribution for any Anchore prior-art adoption per ADR-0001/0002)
5. T-37 — `README.md` final (>= 10 sections) + `CHANGELOG.md` (Keep-a-Changelog format)
6. T-38 — `scripts/benchmark.ts` (1k-component perf, asserts < 30 s on consumer laptop)
7. T-39 — `src/subprocess/cosign.ts` + `--use-syft` / `--use-grype` opt-in gates (cosign verification per ADR-0001)
8. T-40 — Phase α verify round — Writer/Reviewer protocol (independent reviewer subagent invocation, 7-binary canonical rubric, user-gate for star-tier promotion)

## Open questions for user

- L9 着手 OK + T-35 dependency-cruiser security audit gate path (audit findings will be presented before `pnpm add`)
- T-40 Phase α exit gate is the final star-tier promotion checkpoint per rubric §user-gate (AI 自己昇格禁止)

## Subtleties captured this session (cross-project universal)

1. **tsconfig `exactOptionalPropertyTypes: true` × zod `.optional()`** — IR optional fields declared `?: T | undefined`, not bare `?: T`. Applied to sbom-ir.ts and OsvRangeEvent.
2. **CycloneDX 1.5 `serialNumber` strict UUID URN pattern** — derived deterministic UUID via SHA-256 of IR namespace, sliced 32 hex chars into 8-4-4-4-12 layout. `deriveCycloneDxSerialNumber()` in src/emitters/cyclonedx-1.5.ts.
3. **SPDX 2.3 `SPDXID` pattern `^SPDXRef-[A-Za-z0-9.\-]+$`** — sanitised IR ids by replacing runs of non-conforming chars with single hyphen via `sanitizeSPDXID()`.
4. **Pre-commit secret-scan bypass for security-tool test fixtures** — `PRE_COMMIT_SCAN_DISABLED=1 git commit` for synthetic credential fixtures in paid-defense.test.ts + paid-api-blocking.test.ts. Documented bypass per project rule.
5. **Commander 13.x built-in "Did you mean" suggestion** — disabled via `program.showSuggestionAfterError(false)` so AC-005-2 wording comes from our own did-you-mean module (lowercase + colon).
6. **Vitest 3.x per-test-file module isolation** — paid-defense + schema-loader caches use per-format Ajv instances rather than shared singleton to avoid $id-collision symptoms surfaced by the isolation model.

## Blocked / waiting on

- User OK for L9 着手 + T-35 dependency-cruiser security audit gate

## Related session handoff

- Cold-start handoff: stored on local Desktop (per session log, gitignored). Next handoff file
  at `<user-home>/Desktop/next_session_handoff_sbom_pilot_L9_resume_2026_05_20.md`.
- Cross-session auto-memory pointer maintained in user home internal memory dir; entry for
  this PJ updated alongside this commit (L0-L8 complete, L9 remaining).
