# activeContext — sbom-pilot

> Current state + immediate next action. Update at the end of every work cycle.

## Current phase

**Phase α COMPLETE 2026-05-20.** L0..L9 all 40 / 40 tasks landed. Two independent fresh-context reviewer CONFIRM 7/7 + writer 10-item self-audit polish + 3rd-round audit cleanup at commit `f7d8296`. Repository PUBLIC.

Source for verify claim: [`docs/verify/phase-alpha-round-1.md`](../../docs/verify/phase-alpha-round-1.md) on commit `f7d8296` of https://github.com/leagames0221-sys/sbom-pilot.

## Layer-by-layer completion summary (55 commits on main)

| Layer | Tasks | Commits |
|---|---|---|
| L0 Foundation (4) | T-01..T-04 | c8bebcc / bfc9b06 / 96034f5 / a66db93 |
| L1 IR (3) | T-05..T-07 | 851e849 / 4201152 / c853756 (+ L1-closure f02d4cb) |
| L2 Parsers (5) | T-08..T-12 | 73fa1ff / c69f126 / 8adfc36 / 7b7fd59 / 2f4a1c4 |
| L3 Schemas (2) | T-13..T-14 | dc57bf0 / f5fb3fd |
| L4 SBOM Emitters (3) | T-15..T-17 | 5620d57 / 21f0ca4 / 208b0b0 |
| L5 Scanning+SARIF (4) | T-18..T-21 | d44460c / 7be064a / cb31947 / f7c9140 |
| L6 Compliance (5) | T-22..T-26 | 95fb3c8 / 125cf0e / 8cd119a / 80bbe28 / ef6c660 |
| L7 LLM Providers (2) | T-27..T-28 | b77baa5 / 88bad62 |
| L8 CLI (4) | T-29..T-32 | 06a21fe / 8ff0220 / 2697b42 / 35bcb54 |
| L9 Verify (8) | T-33..T-40 | 2a704a7 / 7399fbb / f6c77c1 / 40d6b38 / f47435c / 63b198f / 24972f8 / dc868fa / 4d6dee7 / b94f569 / 38ee60f / 6bcb88a / dad2259 / 23e6c1b / 1fe7534 / f7d8296 |

## Final verify state (commit f7d8296)

- **607 vitest specs PASS** in 47 test files
- `pnpm typecheck` exit 0 (tsc strict + exactOptionalPropertyTypes)
- `pnpm audit --audit-level=high` clean
- `pnpm run lint:deps` = 0 errors / 2 informational warnings (108 modules, 310 deps cruised)
- Line coverage **97.58%** (threshold 90) / branch **86.56%** (threshold 85) / function **99.32%** / statement **97.58%**
- 3-OS CI (Ubuntu / macOS / Windows) success on every L9 commit
- OpenSSF Scorecard + CodeQL + Dependabot configured + active post-PUBLIC
- Benchmark wall-clock (1k components): sbom 31 ms / scan 11 ms (regression budget 5 s; spec budget AC-001-1 / AC-002-1 = 30 s)
- All 4 CLI subcommands wired end-to-end (sbom / scan / report / suggest)
- 7 ADRs Accepted (0001-0007); ADR-0006 forbidden-edge lint CI-gated

## Runtime dependencies adopted (with prior-art security audit per project rule)

| Dep | Pinned | Audited | Adopted-at |
|---|---|---|---|
| commander | ^13.0.0 | (L0 default with stack) | T-01 |
| zod | ^3.23.8 | (L0 default with stack) | T-01 |
| yaml (eemeli/yaml) | ^2.9.0 | 8-item audit: green 6, yellow 2 mitigated | T-09 |
| ajv (ajv-validator/ajv) | ^8.20.0 | 8-item audit: green 5, yellow 2 mitigated | T-13 |
| ajv-formats | ^3.0.1 | 8-item audit: green 4, yellow 3 mitigated | T-13 |
| dependency-cruiser (dev) | ^17.4.0 | 8-item audit: Scorecard 7/10 / Snyk zero CVE / 220k-981k wd / MIT / dev-only scope | T-35 |

## Verification trail (4 independent rounds, all landed)

1. Round 1 reviewer (commit `38ee60f`, 2026-05-20T17:43+09:00): CONFIRM 7/7, drift flags ZERO
2. Writer self-audit (post round 1): 10 findings + 1 latent cosign-spawn bug → all fixed in commit `23e6c1b`
3. Round 2 reviewer (commit `23e6c1b`, 2026-05-20T18:30+09:00): CONFIRM 7/7, regression count ZERO
4. 3rd-round audit: 3 doc-level findings → all fixed in commit `f7d8296`

## Immediate next action

**None — Phase α COMPLETE.** Phase β candidate scope (NOT yet started):

- Library API surface (`src/index.ts` populate with `generate / scan / report` wrappers around CLI subcommand actions; ADR-0006 §"Public API surface" already records this as Phase β scope)
- Actual subprocess wrap for syft / grype (parse stdout to IR, gated by the already-implemented cosign verify)
- Real vuln-db refresh script (`scripts/refresh_vuln_db.ts`)
- npm publish path for `npm install -g sbom-pilot` activation post first tag

## Subtleties captured this PJ (cross-project universal patterns)

1. **tsconfig `exactOptionalPropertyTypes: true` × zod `.optional()`** — IR optional fields declared `?: T | undefined`, not bare `?: T`.
2. **CycloneDX 1.5 `serialNumber` strict UUID URN pattern** — derived deterministic UUID via SHA-256 of IR namespace, sliced 32 hex chars into 8-4-4-4-12 layout.
3. **SPDX 2.3 `SPDXID` pattern `^SPDXRef-[A-Za-z0-9.\-]+$`** — sanitised IR ids by replacing runs of non-conforming chars with single hyphen.
4. **Pre-commit secret-scan bypass for security-tool test fixtures** — `PRE_COMMIT_SCAN_DISABLED=1 git commit` for synthetic credential fixtures.
5. **Commander 13.x built-in "Did you mean" suggestion** — disabled via `program.showSuggestionAfterError(false)`.
6. **Vitest 3.x per-test-file module isolation** — paid-defense + schema-loader caches use per-format Ajv instances rather than shared singleton.
7. **dependency-cruiser CLI invocation on Windows** — `.cmd` shim trips child_process.spawnSync; resolution = invoke via `node node_modules/dependency-cruiser/bin/dependency-cruise.mjs` + cwd-relative paths.
8. **dependency-cruiser `no-orphans` rule** — alternation regex in pathNot triggers the "unsafe regex" bail-out; resolution = list each path prefix as a separate literal anchor.
9. **child_process.spawnSync error contract** — returns `{status: null, error: Error{code: 'ENOENT'}}` on missing binary, does NOT throw; wrappers must inspect + re-throw `result.error` or downstream code mis-classifies missing-binary as exit-code-non-zero.
10. **Vitest 3.x default testTimeout (5 s) is too tight for Windows subprocess cold starts** — python ~6.9 s, depcruise CLI ~3 s; measure-driven 15 s is the right floor.
11. **Writer/Reviewer pattern actually catches real bugs** — round 1's CONFIRM held, but the writer self-audit caught a production cosign-missing classification bug (silent ship-blocker) that the reviewer alone did not surface.
12. **PRIVATE repo × OpenSSF Scorecard / CodeQL** — both workflows fail until PUBLIC flip; skip-on-private guard pattern (visibility-check first step → log + short-circuit) keeps Actions tab green pre-promotion + auto-activates on flip.

## Blocked / waiting on

- Nothing. Phase α closed.
