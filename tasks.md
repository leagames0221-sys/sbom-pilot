# sbom-pilot — Tasks (Stage 4 output)

> **Status**: Stage 4 — awaiting user approve gate
> **Workflow**: 4-stage Spec-Driven Development. This is the Stage 4 deliverable.
> **Last updated**: 2026-05-19
> **Total tasks**: 40 (L0-L9, ten layers)
> **Implementation model**: 1 task = 1 commit, sequential. Each commit references the task ID + AC IDs in the message.
> **Verify gate**: at the end of L9, the Writer/Reviewer protocol per ADR-0007 runs; user gate clears to top-rank tier.

---

## L0 — Foundation (4 tasks)

### T-01: package.json + tsconfig.{json,build.json} + vitest.config.ts
- _Boundary:_ `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.npmrc`, `pnpm-workspace.yaml`
- _Depends:_ none
- _AC:_ AC-NF-engine-strict, AC-NF-pinned-deps, AC-NF-audit-gate
- _Verify:_ `pnpm install --frozen-lockfile` succeeds; `pnpm tsc --noEmit` exits 0; `pnpm vitest run` collects 0 tests but does not error.

### T-02: src/exit-codes.ts (sysexits enum)
- _Boundary:_ `src/exit-codes.ts`, `tests/unit/exit-codes.test.ts`
- _Depends:_ T-01
- _AC:_ AC-005-2, AC-005-3, AC-001-4, AC-002-5, AC-003-4, AC-003-6, AC-NF-cosign-gate
- _Verify:_ vitest spec asserts all 11 sysexits constants exist and have expected numeric values per BSD sysexits.h.

### T-03: src/util/ (atomic-write + ansi-strip + credential-scrub)
- _Boundary:_ `src/util/atomic-write.ts`, `src/util/ansi-strip.ts`, `src/util/credential-scrub.ts`, `tests/unit/util/*.test.ts`
- _Depends:_ T-01
- _AC:_ AC-001-3, AC-002-7 (atomic), AC-005-4 (ansi-strip), AC-NF-credentials (scrub)
- _Verify:_ atomic-write injects mid-write process kill and asserts ZERO partial file on disk; ansi-strip golden table 30 cases; credential-scrub injects 8 synthetic credential patterns (Bearer, AWS AKIA…, password=, _KEY=, etc.) and asserts ZERO leakage.

### T-04: scripts/check_forbidden_tokens.py + pre-commit wire-up
- _Boundary:_ `scripts/check_forbidden_tokens.py`, `.pre-commit-config.yaml` (replace placeholder), `tests/unit/mask-script.test.ts` (or python pytest if simpler)
- _Depends:_ T-01
- _AC:_ (PJ rule: channel B mask) — not a spec AC, but a PJ-required pre-commit gate
- _Verify:_ stdlib-only Python script greps staged diff against `.claude/internal_notes.md` forbidden tokens, fails closed if internal_notes missing, exits 1 on any hit. Test injects a forbidden token into a temp file and asserts script exit 1.

---

## L1 — IR layer (3 tasks)

### T-05: src/ir/sbom-ir.ts (types)
- _Boundary:_ `src/ir/sbom-ir.ts`, `tests/unit/ir/sbom-ir.test.ts`
- _Depends:_ T-01
- _AC:_ ADR-0005 (IR shape)
- _Verify:_ TypeScript compiles; type-level test (using `@types/expect-type` or equivalent) asserts Component / Relationship / IR shape matches ADR-0005.

### T-06: src/ir/schemas.ts (zod runtime validation)
- _Boundary:_ `src/ir/schemas.ts`, `tests/unit/ir/schemas.test.ts`
- _Depends:_ T-05
- _AC:_ AC-001-5, AC-001-6 (IR validation before schema-format emit), ADR-0005
- _Verify:_ zod schema rejects 10 negative fixtures (missing fields, wrong types) + accepts 5 positive fixtures.

### T-07: src/ir/index.ts (barrel) + IR golden round-trip test
- _Boundary:_ `src/ir/index.ts`, `tests/golden/ir/round-trip.test.ts`
- _Depends:_ T-05, T-06
- _AC:_ ADR-0005 reversibility
- _Verify:_ JSON.parse(JSON.stringify(ir)) → zod validate → equality assertion on 3 representative IR fixtures.

---

## L2 — Parsers (5 tasks)

### T-08: src/parsers/npm.ts (package.json + package-lock.json)
- _Boundary:_ `src/parsers/npm.ts`, `tests/fixtures/projects/npm-tiny/`, `tests/unit/parsers/npm.test.ts`
- _Depends:_ T-07
- _AC:_ AC-001-1, AC-001-7
- _Verify:_ parse a synthetic 5-dep package-lock.json → IR with 5 components + correct depends-on edges + license fields populated.

### T-09: src/parsers/pnpm.ts (pnpm-lock.yaml)
- _Boundary:_ `src/parsers/pnpm.ts`, `tests/fixtures/projects/pnpm-tiny/`, `tests/unit/parsers/pnpm.test.ts`
- _Depends:_ T-07
- _AC:_ AC-001-1
- _Verify:_ parse a synthetic pnpm-lock.yaml → IR component count matches; dev-deps marked as `dev-depends-on`.

### T-10: src/parsers/pip.ts (requirements.txt + pip-tools lockfile pattern)
- _Boundary:_ `src/parsers/pip.ts`, `tests/fixtures/projects/pip-tiny/`, `tests/unit/parsers/pip.test.ts`
- _Depends:_ T-07
- _AC:_ AC-001-1
- _Verify:_ parse 3 requirements patterns (==pin / >=range / hash-pinned) → IR.

### T-11: src/parsers/go-mod.ts (go.mod + go.sum)
- _Boundary:_ `src/parsers/go-mod.ts`, `tests/fixtures/projects/go-mod-tiny/`, `tests/unit/parsers/go-mod.test.ts`
- _Depends:_ T-07
- _AC:_ AC-001-1
- _Verify:_ parse a synthetic go.mod with 4 require directives → IR with pURL-formatted IDs (`pkg:golang/<module>@<version>`).

### T-12: src/parsers/index.ts (manifest detection dispatcher)
- _Boundary:_ `src/parsers/index.ts`, `tests/unit/parsers/dispatch.test.ts`
- _Depends:_ T-08, T-09, T-10, T-11
- _AC:_ AC-001-1, AC-001-4
- _Verify:_ given a project-dir, detect the manifest type by file presence (package-lock.json before package.json; pnpm-lock.yaml before either); empty dir → exits with `EX_DATAERR`.

---

## L3 — Vendored schemas (2 tasks)

### T-13: src/schemas/ (SPDX 2.3 + CycloneDX 1.5 + SARIF 2.1.0 JSON schemas)
- _Boundary:_ `src/schemas/spdx-2.3.json`, `src/schemas/cyclonedx-1.5.json`, `src/schemas/sarif-2.1.0.json`, `src/schemas/index.ts` (loader + ajv compile), `tests/unit/schemas/load.test.ts`
- _Depends:_ T-01
- _AC:_ AC-001-5, AC-001-6, AC-002-4
- _Verify:_ Each schema loads at runtime, ajv compiles successfully, validates a canonical reference document from the upstream spec.
- _Note:_ vendoring step requires download from official spec URLs; commit with retrieval-date in a header comment.

### T-14: schema validation helper + negative-test corpus
- _Boundary:_ `src/schemas/validate.ts`, `tests/golden/schema-validation/`, `tests/unit/schemas/validate.test.ts`
- _Depends:_ T-13
- _AC:_ AC-001-5, AC-001-6, AC-002-4
- _Verify:_ wrapper function `validate(format, doc) → { ok, errors }`; negative corpus of 15 malformed docs → all rejected.

---

## L4 — SBOM emitters (3 tasks)

### T-15: src/emitters/_shared.ts (atomic + citation footer + deterministic namespace)
- _Boundary:_ `src/emitters/_shared.ts`, `tests/unit/emitters/_shared.test.ts`
- _Depends:_ T-03, T-07
- _AC:_ AC-001-3, AC-001-8, AC-003-5
- _Verify:_ atomic emit golden; deterministic namespace = stable URN given project + git HEAD; citation footer format-string.

### T-16: src/emitters/spdx-2.3.ts
- _Boundary:_ `src/emitters/spdx-2.3.ts`, `tests/golden/sbom/spdx-2.3/`, `tests/unit/emitters/spdx-2.3.test.ts`
- _Depends:_ T-14, T-15
- _AC:_ AC-001-1, AC-001-5, AC-001-7, AC-001-8
- _Verify:_ IR → SPDX 2.3 → ajv schema PASS; golden snapshot stable across runs; 3 reference IR fixtures → 3 golden snapshots.

### T-17: src/emitters/cyclonedx-1.5.ts
- _Boundary:_ `src/emitters/cyclonedx-1.5.ts`, `tests/golden/sbom/cyclonedx-1.5/`, `tests/unit/emitters/cyclonedx-1.5.test.ts`
- _Depends:_ T-14, T-15
- _AC:_ AC-001-2, AC-001-6, AC-001-7, AC-001-8
- _Verify:_ same as T-16 against CycloneDX 1.5 schema + golden corpus.

---

## L5 — Vuln scanning + SARIF (4 tasks)

### T-18: src/scanners/vuln-db.ts (OSV cache load + atomic refresh)
- _Boundary:_ `src/scanners/vuln-db.ts`, `scripts/refresh_vuln_db.ts`, `tests/fixtures/vuln-db-seed/`, `tests/unit/scanners/vuln-db.test.ts`
- _Depends:_ T-03
- _AC:_ AC-002-2, AC-002-3, AC-NF-offline
- _Verify:_ seed snapshot loads; refresh atomic temp-rename golden (inject mid-rename failure → original intact); age-warning fires at > 30 days.

### T-19: src/scanners/correlator.ts (component ↔ advisory match by pURL)
- _Boundary:_ `src/scanners/correlator.ts`, `tests/unit/scanners/correlator.test.ts`
- _Depends:_ T-07, T-18
- _AC:_ AC-002-1, AC-002-6
- _Verify:_ given IR with 5 components + seed DB with 3 advisories → 3 findings with correct purl + version-range + suggestedUpgrade.

### T-20: src/scanners/severity.ts (ranking + dedupe)
- _Boundary:_ `src/scanners/severity.ts`, `tests/unit/scanners/severity.test.ts`
- _Depends:_ T-19
- _AC:_ AC-002-1, AC-002-5, AC-002-7
- _Verify:_ severity ordering critical > high > medium > low > unknown; dedupe by ghsa_id keeps highest severity.

### T-21: src/emitters/sarif-2.1.0.ts + scan end-to-end test
- _Boundary:_ `src/emitters/sarif-2.1.0.ts`, `tests/golden/sbom/sarif-2.1.0/`, `tests/e2e/scan.test.ts`
- _Depends:_ T-14, T-15, T-20
- _AC:_ AC-002-1, AC-002-4, AC-002-7
- _Verify:_ findings → SARIF v2.1.0 → ajv schema PASS; e2e from project-dir → IR → scan → SARIF golden.

---

## L6 — Compliance emitters (5 tasks)

### T-22: src/emitters/compliance/_shared.ts + regulation-snippets/ scaffolding
- _Boundary:_ `src/emitters/compliance/_shared.ts`, `src/emitters/compliance/regulation-snippets/{appi-26-2,meti-sbom-v2,ntia,eu-cra}.ts`, `tests/unit/emitters/compliance/_shared.test.ts`
- _Depends:_ T-15
- _AC:_ AC-003-5
- _Verify:_ snippet modules export versioned string + retrieval-date; snippet age test warns if any > 12 months.

### T-23: src/emitters/compliance/appi-26-2.ts (改正個情法 26-2、 日本語)
- _Boundary:_ `src/emitters/compliance/appi-26-2.ts`, `tests/golden/compliance/appi-26-2/`, `tests/unit/emitters/compliance/appi-26-2.test.ts`
- _Depends:_ T-22, T-20
- _AC:_ AC-003-1, AC-003-7
- _Verify:_ IR + findings with high CVE → 日本語 report; high-CVE items appear in priority-disclosure section at top; UTF-8 + no BOM (AC-003-8).

### T-24: src/emitters/compliance/meti-sbom-v2.ts (METI SBOM v2.0、 日本語)
- _Boundary:_ `src/emitters/compliance/meti-sbom-v2.ts`, `tests/golden/compliance/meti-sbom-v2/`, `tests/unit/emitters/compliance/meti-sbom-v2.test.ts`
- _Depends:_ T-22
- _AC:_ AC-003-2
- _Verify:_ minimum-field validator outputs PASS/FAIL per field; missing supplier → FAIL with literal reason.

### T-25: src/emitters/compliance/ntia.ts (NTIA Minimum Elements、 English)
- _Boundary:_ `src/emitters/compliance/ntia.ts`, `tests/golden/compliance/ntia/`, `tests/unit/emitters/compliance/ntia.test.ts`
- _Depends:_ T-22
- _AC:_ AC-003-3
- _Verify:_ 7 mandatory fields checked per artifact; English output; PASS/FAIL columns.

### T-26: src/emitters/compliance/eu-cra.ts (EU CRA Annex I、 English)
- _Boundary:_ `src/emitters/compliance/eu-cra.ts`, `tests/golden/compliance/eu-cra/`, `tests/unit/emitters/compliance/eu-cra.test.ts`
- _Depends:_ T-22, T-17
- _AC:_ AC-003-4
- _Verify:_ SPDX-input refused with `EX_USAGE`; CycloneDX-input → CRA checklist; English output.

---

## L7 — LLM providers (2 tasks)

### T-27: src/providers/llm/{mock,ollama}.ts + paid-defense.ts (6-layer)
- _Boundary:_ `src/providers/llm/mock.ts`, `src/providers/llm/ollama.ts`, `src/providers/llm/paid-stub.ts`, `src/providers/llm/paid-defense.ts`, `src/providers/llm/index.ts`, `tests/unit/providers/llm/*.test.ts`
- _Depends:_ T-03
- _AC:_ AC-NF-1, AC-NF-2, AC-NF-3, AC-NF-4, AC-NF-5
- _Verify:_ mock + ollama unit tests pass with `fetch` stub; paid-defense unit asserts: constructor refuses without 2-factor env (AC-NF-1); pre-flight raises on token/req/cost overflow (AC-NF-2); error message masks key to first 6 chars (AC-NF-3); CI-mode fetch trap raises on un-stubbed fetch (AC-NF-4); default provider = mock (AC-NF-5).

### T-28: paid-API CI auto-call blocking regression test
- _Boundary:_ `tests/regression/paid-api-blocking.test.ts`
- _Depends:_ T-27
- _AC:_ AC-NF-4, AC-NF-6
- _Verify:_ test attempts unstubbed `fetch('https://api.anthropic.com/...')` and asserts the fetch trap raises before any network call; explicit assertion that no `process.env.ANTHROPIC_API_KEY`-reading code path is reachable from any CLI subcommand by default.

---

## L8 — CLI wire-up (4 tasks)

### T-29: src/cli/index.ts + bin/sbom-pilot.ts (commander setup + Node 20 gate)
- _Boundary:_ `bin/sbom-pilot.ts`, `src/cli/index.ts`, `tests/e2e/cli-help.test.ts`
- _Depends:_ T-02
- _AC:_ AC-005-1, AC-005-3, AC-005-5
- _Verify:_ `--help` lists 4 subcommands < 100 ms; `--version` prints package version + git hash; Node < 20 → `EX_CONFIG`.

### T-30: src/cli/subcommands/sbom.ts + src/cli/subcommands/scan.ts
- _Boundary:_ `src/cli/subcommands/sbom.ts`, `src/cli/subcommands/scan.ts`, `tests/e2e/cli-sbom.test.ts`, `tests/e2e/cli-scan.test.ts`
- _Depends:_ T-12, T-16, T-17, T-21, T-29
- _AC:_ AC-001-1..8, AC-002-1..7
- _Verify:_ `sbom-pilot sbom <fixture>` → valid SPDX to stdout; `--format cyclonedx` → valid CycloneDX; `--output <path>` atomic write; `sbom-pilot scan <fixture>` → SARIF + stderr summary; `--fail-on critical,high` exit policy.

### T-31: src/cli/subcommands/report.ts (4 standards) + suggest.ts
- _Boundary:_ `src/cli/subcommands/report.ts`, `src/cli/subcommands/suggest.ts`, `tests/e2e/cli-report.test.ts`, `tests/e2e/cli-suggest.test.ts`
- _Depends:_ T-23, T-24, T-25, T-26, T-27, T-29
- _AC:_ AC-003-1..8, AC-005-1
- _Verify:_ each `--standard <name>` produces the right golden; `report` without `--standard` lists 4 standards + `EX_USAGE`; `suggest` uses Ollama-default with mock fallback.

### T-32: did-you-mean (Levenshtein) + global flag wiring
- _Boundary:_ `src/cli/did-you-mean.ts`, `src/cli/global-flags.ts`, `tests/unit/cli/did-you-mean.test.ts`, `tests/e2e/cli-unknown.test.ts`
- _Depends:_ T-29
- _AC:_ AC-005-2, AC-005-4
- _Verify:_ `sbom-pilot xyz` → "did you mean: …" + `EX_USAGE`; ANSI strip applied on TTY-output path.

---

## L9 — CI + lint + Phase α gate (8 tasks)

### T-33: .github/workflows/ci.yml (3-OS matrix + audit + drift-check)
- _Boundary:_ `.github/workflows/ci.yml`
- _Depends:_ T-01..T-32 (CI gates everything)
- _AC:_ AC-NF-cross-os, AC-NF-pinned-deps, AC-NF-audit-gate
- _Verify:_ CI run on the verify commit returns conclusion=success on Linux + macOS + Windows; `pnpm audit --audit-level=high` clean.

### T-34: .github/workflows/scorecard.yml + codeql.yml + dependabot.yml
- _Boundary:_ `.github/workflows/scorecard.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`
- _Depends:_ T-33
- _AC:_ AC-NF-pinned-deps (Dependabot), ADR-0007 criterion 7
- _Verify:_ workflows are syntactically valid; first scheduled run produces SARIF to Code Scanning UI.

### T-35: .dependency-cruiser.cjs (Layer boundary lint per ADR-0006)
- _Boundary:_ `.dependency-cruiser.cjs`, `tests/unit/lint/dependency-direction.test.ts`
- _Depends:_ T-08..T-26 (all source layers exist)
- _AC:_ ADR-0006 forbidden edges
- _Verify:_ negative-test fixture imports a forbidden edge (parser → emitter) → lint exits non-zero with the literal forbidden-edge name.

### T-36: NOTICE file + license attribution
- _Boundary:_ `NOTICE`
- _Depends:_ T-01
- _AC:_ AC-NF-license-attribution, ADR-0001
- _Verify:_ NOTICE cites Apache-2.0 attribution for any module informed by Anchore prior-art (per ADR-0002 + ADR-0001).

### T-37: README.md final + CHANGELOG.md
- _Boundary:_ `README.md`, `CHANGELOG.md`
- _Depends:_ T-01..T-35
- _AC:_ ADR-0007 criterion 2 (Quality README) + Phase α exit checklist
- _Verify:_ README ≥ 10 sections (problem / quick start / subcommands / architecture diagram / compliance support / paid-API defense / security / development / testing / license); 30-sec pitch in first paragraph; CHANGELOG follows Keep-a-Changelog.

### T-38: scripts/benchmark.ts (1k-component scan time)
- _Boundary:_ `scripts/benchmark.ts`, `tests/e2e/perf.test.ts`
- _Depends:_ T-30
- _AC:_ AC-001-1 (< 30 s on 1k-dep), AC-002-1 (< 30 s on 1k-component)
- _Verify:_ benchmark generates a 1k-component fixture, runs `sbom` and `scan`, asserts wall-clock < 30 s on consumer-laptop GitHub Actions runner.

### T-39: cosign verification gate + opt-in --use-syft/--use-grype
- _Boundary:_ `src/subprocess/cosign.ts`, `src/cli/subcommands/sbom.ts` (extend), `tests/unit/subprocess/cosign.test.ts`
- _Depends:_ T-29
- _AC:_ AC-NF-cosign-gate, ADR-0001 §Adoption shape
- _Verify:_ when `--use-syft` is passed without cosign verify success, exits `EX_NOPERM` and does NOT spawn the subprocess; unit test mocks the cosign verify result.

### T-40: Phase α verify round — Writer/Reviewer protocol invocation
- _Boundary:_ verify-report drafted in `docs/verify/phase-alpha-round-N.md`; tier-reviewer subagent invocation via Agent tool
- _Depends:_ T-01..T-39
- _AC:_ ADR-0007 protocol (all 7 binary criteria) + Phase α exit checklist
- _Verify:_ Writer drafts evidence per criterion; tier-reviewer subagent independently verifies in fresh context; on CONFIRM 7/7 PASS → user gate; on REFUTE → fix and re-run.

---

## Coverage & summary

### AC ↔ Task matrix (38 AC mapped to L0-L9 tasks)

| AC group | Count | Implementation tasks |
| --- | --- | --- |
| F-001 (SBOM gen) | 8 | T-08, T-09, T-10, T-11, T-12, T-15, T-16, T-17 |
| F-002 (Vuln scan) | 7 | T-18, T-19, T-20, T-21 |
| F-003 (Compliance reports) | 8 | T-22, T-23, T-24, T-25, T-26 |
| F-005 (CLI UX) | 5 | T-29, T-30, T-31, T-32 |
| NF — paid-API 6-layer | 6 | T-27, T-28 |
| NF — credentials/cosign/license | 3 | T-03 (scrub), T-36 (license), T-39 (cosign) |
| NF — offline/cross-OS/supply-chain | 6 | T-01 (engines), T-18 (offline cache), T-33 (CI), T-34 (Dependabot) |

### Phase α exit checklist (literal from ADR-0007)

- [ ] T-01..T-39 all merged on main
- [ ] vitest spec count ≥ 500, line-coverage ≥ 90% (verified at T-40)
- [ ] CI 3-OS matrix conclusion=success on the verify commit (T-33)
- [ ] pnpm audit --audit-level=high clean (T-33)
- [ ] gitleaks scan clean (every commit gated)
- [ ] No channel B token leaks (T-04 mask script + per-commit gate)
- [ ] T-40 Writer/Reviewer CONFIRM 7/7 PASS
- [ ] User explicit OK for top-rank promotion
- [ ] README + LICENSE + SECURITY + NOTICE finalized (T-36, T-37)

### Implementation cadence (1 task = 1 commit)

- L0-L1 (T-01..T-07): foundation + IR — estimated 2-3 hours
- L2-L3 (T-08..T-14): parsers + schemas — estimated 3-4 hours
- L4-L5 (T-15..T-21): SBOM emitters + vuln scanning — estimated 4-5 hours
- L6 (T-22..T-26): compliance emitters (4 standards) — estimated 4-5 hours
- L7 (T-27..T-28): LLM providers + paid-API regression — estimated 1-2 hours
- L8 (T-29..T-32): CLI wire-up — estimated 2-3 hours
- L9 (T-33..T-40): CI + lint + docs + verify — estimated 3-4 hours

**Total**: ~20-26 hours of implementation. Aligned with 1-2 day target if dedicated; multi-day if interleaved with other work.

---

## Stage 4 approve gate

Please review and approve:

- §L0..L9 — 40 tasks across 10 layers, breakdown granularity OK?
- AC ↔ Task matrix — every AC has at least one task?
- Phase α exit checklist — accurate?
- Implementation cadence — 1 task = 1 commit pattern OK?

After approve, Phase 1 implementation kickoff at T-01.
