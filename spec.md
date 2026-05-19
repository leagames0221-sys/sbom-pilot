# sbom-pilot — Specification (Stage 1 Discovery output)

> **Status**: Stage 1 Discovery — **APPROVED 2026-05-19** (user clearance, all 4 questions confirmed at recommended single-route)
> **Workflow**: 4-stage Spec-Driven Development (Discovery → Requirements (EARS) → Design → Tasks)
> **Last updated**: 2026-05-19 (Stage 1 closure + locked decisions)

---

## §1. Scope 1-line declaration

> `sbom-pilot` is a defensive-first CLI that emits Software Bill of Materials
> (SBOM) in SPDX 2.3 + CycloneDX 1.5, correlates the SBOM against cached
> OSV/NVD/GHSA snapshots offline-first, and produces JP/US/EU compliance
> reports (改正個情法 / METI SBOM v2.0 / NTIA Minimum Elements / EU CRA
> Annex I), targeting individual developers and SMBs who can't justify
> enterprise SBOM tooling.

**Audience**: individual JP developers + JP/intl SMB CTOs + freelance contractors + OSS educators
**Deadline**: Phase α (Strong-Hire tier verify) ETA = 1–2 days from Stage 1 approve gate
**Phase tag**: Phase α (Discovery → Implementation → tier verify) → Phase β (post-PUBLIC iteration, out of scope here)

---

## §2. Prior art scan (prior-art-first discipline, decomposed)

### §2.1 Direct competitors / parents (canonical SBOM + vulnerability tooling)

| Tool | Type | License | Stack | Stars (approx) | Adoption gate verdict |
| --- | --- | --- | --- | --- | --- |
| [anchore/syft](https://github.com/anchore/syft) | SBOM generator | Apache-2.0 | Go | ~6k+ (verify in audit) | **Adopt as decomposed seed**: SBOM-emitter algorithms + multi-ecosystem parser pattern. Scorecard / signed releases / OSSF Allstar to literal verify at Stage 1.5 audit gate. |
| [anchore/grype](https://github.com/anchore/grype) | Vulnerability scanner | Apache-2.0 | Go | ~7k+ (verify in audit) | **Adopt as decomposed seed**: OSV/NVD correlation logic + match heuristics. Same audit gate as syft. |
| [aquasecurity/trivy](https://github.com/aquasecurity/trivy) | All-in-one scanner (SBOM + vuln + IaC + secret) | Apache-2.0 | Go | ~21k+ (verify) | **Reference**: out-of-scope to vendor (too broad), but SBOM output format + ecosystem coverage matrix to reference. |
| [google/osv-scanner](https://github.com/google/osv-scanner) | Vuln scanner backed by OSV.dev | Apache-2.0 | Go | ~5k+ (verify) | **Reference**: OSV.dev consumption pattern + lockfile-first input format. |
| [DependencyTrack/dependency-track](https://github.com/DependencyTrack/dependency-track) | SaaS server | Apache-2.0 | Java/JS | ~2k+ (verify) | **Negative prior art**: server-deploy model out of scope. We deliberately do *not* require a server. |
| [CycloneDX/cyclonedx-cli](https://github.com/CycloneDX/cyclonedx-cli) | SBOM CLI | Apache-2.0 | .NET | ~0.6k+ (verify) | **Reference**: CycloneDX 1.5 emission canonical reference. |
| [spdx/tools-golang](https://github.com/spdx/tools-golang) | SPDX library | Apache-2.0 | Go | ~0.6k+ (verify) | **Adopt if Go-stack** (depend literally) / **Reference if TS-stack** (port subset) |

### §2.2 Adoption gate (security audit before any vendor / depend / fork, Stage 1.5)

Each tool above before any adoption (vendor / depend / fork) must literal pass:

| Gate item | Threshold | Verify path |
| --- | --- | --- |
| OpenSSF Scorecard | ≥ 7.0 | `scorecard.dev` UI or CLI |
| License | Permissive (Apache-2.0 / MIT / BSD-3) | LICENSE file + `pnpm licenses` / `go mod license` |
| Signed releases | Yes (cosign or GPG) | `git tag -v` or `cosign verify-blob` on release artifacts |
| Active maintenance | last commit < 60 days | `git log -1 --format=%cd` |
| Stars | ≥ 1k for primary, ≥ 0.3k for support | GitHub API |
| CVE history | No unresolved high/critical in last 12 months | GitHub Security Advisories + `pip-audit` / `pnpm audit` equivalent |
| Supply-chain hygiene | Pinned deps / lockfile committed / Dependabot active | `.github/dependabot.yml` + lockfile in repo |
| Red flag scan (TeamPCP / Shai-Hulud / s1ngularity patterns) | 0 hits | grep for known poisoned patterns |

**Stage 1.5 audit output**: `docs/adr/0001-prior-art-audit.md` (per-tool verdict table + verify trail).

### §2.3 Negative prior art (intentionally not following)

- **Snyk / Sonatype / Chainguard** (enterprise SaaS): pricing model + closed-source disqualifies for individual / SMB target audience
- **Spotify model org-deploy** (anti-pattern from internal prior-art scan): cargo-cult risk acknowledged, we don't claim org-scale results from a personal tool

---

## §3. Differentiation axis (final cut at user approve gate)

```
┌────────────────────────────────────────────────────────────────────┐
│                       sbom-pilot wedge                              │
│                                                                     │
│   JP-compliance reporting (first-class)                             │
│     ├─ 改正個情法 26-2 漏えい等報告 evidence emitter                  │
│     ├─ METI SBOM 導入手引き v2.0 minimum-field validator              │
│     ├─ NTIA Minimum Elements report                                  │
│     └─ EU CRA Annex I machine-readable SBOM                         │
│                                                                     │
│   Offline-first (default)                                          │
│     ├─ vuln DB ships as cached snapshot                             │
│     ├─ `--refresh` flag for explicit online egress                  │
│     └─ deterministic output independent of network state            │
│                                                                     │
│   Sibling positioning (security tool #2 in a pair)                  │
│     ├─ shared CLI UX with security tool #1                          │
│     ├─ shared SARIF emitter / atomic writer / exit codes            │
│     └─ shared paid-API 6-layer defense                              │
│                                                                     │
│   Consumer-laptop ergonomics                                       │
│     ├─ no GPU, no server, no Docker required                        │
│     ├─ < 50 MB binary or < 20 MB npm package                        │
│     └─ runs in < 30 seconds on a typical Node project               │
└────────────────────────────────────────────────────────────────────┘
```

**No competitor combines all four**. syft+grype cover (1) partial / (2) no / (3) no / (4) yes. Trivy covers (1) no / (2) no / (3) no / (4) yes. OSV-Scanner covers (1) no / (2) no / (3) no / (4) yes.

---

## §4. JP / US / EU compliance scope (final cut at approve gate)

### §4.1 改正個情法 (Japan APPI 2024 + 2026 amendments)

- **Article 26-2** (漏えい等の発生時の通知 + 報告): 個人情報保護委員会への報告 + 本人への通知が legal obligation
- **SBOM evidence role**: when an incident involves an upstream dependency, the SBOM + version-pin trace forms the evidence chain for "発生原因" disclosure
- **sbom-pilot output**: a JP-formatted report (日本語) listing the dependency + CVE + version + remediation suggestion, ready to attach to 個人情報保護委員会 reporting template

### §4.2 METI SBOM 導入手引き v2.0 (2024-08)

- **Minimum fields**: component name / version / supplier / license / hash / dependency relationship / SBOM author / timestamp (NTIA Minimum Elements 互換 + JP拡張)
- **sbom-pilot output**: a SPDX 2.3 + CycloneDX 1.5 emission that literal validates against the METI minimum field set, with a 日本語 field-by-field validator report

### §4.3 NTIA Minimum Elements (US EO 14028)

- 7 mandatory fields per artifact: name / supplier / version / unique identifier / dependency relationship / author / timestamp
- **sbom-pilot output**: NTIA-compliance summary section in the SBOM report, English

### §4.4 EU Cyber Resilience Act (CRA) Annex I

- **Article 13** / **Annex I §1-2**: machine-readable SBOM mandatory for products with digital elements placed on the EU market
- **sbom-pilot output**: CycloneDX 1.5 (CRA-preferred machine-readable format per [ENISA guidance](https://www.enisa.europa.eu/)) + Annex I compliance checklist report, English

### §4.5 Final cut — LOCKED at Stage 1 approve gate (2026-05-19)

**Cut A: 4 全件** (改正個情法 + METI + NTIA + EU CRA) — user-approved single route.

| Cut option | scope | dev cost | portfolio value | verdict |
| --- | --- | --- | --- | --- |
| **Cut A**: 4 全件 (改正個情法 + METI + NTIA + EU CRA) | full | ~+4 hours over base | wide JP + intl niche | ✅ **LOCKED** |
| Cut B: JP 2 only (改正個情法 + METI) | narrower | base | JP-only niche | ❌ rejected (narrower wedge) |
| Cut C: NTIA + EU CRA only (intl, no JP) | narrower | base | intl-only, loses JP wedge | ❌ rejected (no JP wedge) |

Rationale: dev cost increment is modest (compliance reports are mostly templated text + field validation, not novel logic); portfolio value of being the only tool with 4-regulation literal coverage is high.

---

## §5. Stack judgment (final lock at approve gate)

### §5.1 Option A — TypeScript (Node.js 20 LTS)

**Pros**:
- Sibling reuse from security tool #1: SARIF emitter, atomic writer, sysexits CLI, probe loader, paid-API 6-layer defense (≈ 1500 LOC literal reusable)
- Faster Stage 4 implementation (≈ 1 day saved on shared infra)
- pnpm + vitest + commander + zod stack already proven in sibling
- npm package distribution (zero-install via `npx`)

**Cons**:
- SPDX/CycloneDX TypeScript libraries less mature than Go counterparts ([@cyclonedx/cyclonedx-library](https://www.npmjs.com/package/@cyclonedx/cyclonedx-library) covers 80% of v1.5 but lags v1.6, [`spdx-license-ids`](https://www.npmjs.com/package/spdx-license-ids) covers IDs but no full SPDX 2.3 emitter)
- Wrapping syft/grype Go binaries requires child-process invocation + binary distribution (npm-side: separate platform tarballs)
- Some package-manifest parsing (Go modules, Cargo) easier in native Go

**Estimated dev time**: 1.5 days from Stage 1 approve to Strong-Hire tier ★ verify

### §5.2 Option B — Go

**Pros**:
- Native dependency on [`anchore/syft`](https://github.com/anchore/syft) and [`anchore/grype`](https://github.com/anchore/grype) as Go libraries (not subprocess wrap)
- [`spdx/tools-golang`](https://github.com/spdx/tools-golang) (official SPDX lib, Apache-2.0) is mature
- Single-binary deploy ergonomics (statically linked, no runtime)
- Go modules ecosystem native parsing

**Cons**:
- Zero sibling reuse (re-implement SARIF emitter, atomic writer, CLI exit codes, paid-API defense in Go — ≈ 1500 LOC of fresh work)
- Stack switch cost (new test framework, new CI matrix patterns)
- npm distribution loss (target audience overlap with Node devs)

**Estimated dev time**: 3 days from Stage 1 approve to Strong-Hire tier ★ verify

### §5.3 LOCKED at Stage 1 approve gate (2026-05-19)

**Stack = TypeScript (Option A)** — user-approved single route.

Rationale (calibrated honesty marker ★★ = moderate confidence):
- 1.5-day vs 3-day dev velocity differential is decisive given user-stated 1–2 day target timeline
- Sibling reuse leverage is the highest-EV path
- SPDX/CycloneDX 1.5 emission gap in TS ecosystem is bounded (manual JSON shape literal verifiable against canonical schema files in <100 LOC of emitter code)
- syft/grype child-process wrap is a known pattern (Trivy itself wraps subprocess scanners), not novel risk

**Tradeoff accepted**: Go-native ecosystem integration is sacrificed; counter is that sbom-pilot wraps syft/grype rather than competing with them at the SBOM-extraction core.

**ADR**: `docs/adr/0001-stack-typescript.md` (drafted at Stage 3 Design once approved here).

---

## §6. Boundary / Forbidden / Depends (cc-sdd 3-bucket)

### §6.1 Boundary (this work owns)

- `src/cli/**` — commander CLI entrypoint, subcommands (`sbom`, `scan`, `report`, `suggest`)
- `src/parsers/**` — package-manifest readers (npm/pnpm/pip/go.mod, exact matrix locked at Stage 2 EARS)
- `src/scanners/**` — OSV/NVD/GHSA correlator, severity ranker, dedupe
- `src/emitters/**` — SPDX 2.3 + CycloneDX 1.5 + SARIF v2.1.0 + JP-compliance reporter
- `src/providers/llm/**` — Ollama default + mock + paid-API stub (6-layer defense)
- `src/schemas/**` — SPDX + CycloneDX + SARIF JSON schemas (vendored from official sources)
- `tests/**` — vitest unit + e2e + golden + schema validation
- `docs/adr/**` — ADR-0001..ADR-000N
- `scripts/check_forbidden_tokens.py` — channel B mask pre-commit hook
- `scripts/refresh_vuln_db.ts` — `--refresh` flag implementation
- `.github/workflows/**` — CI matrix (3-OS) + audit + drift-check + license-check

### §6.2 Forbidden (do not touch / read-only)

- Sibling security tool #1 source tree (separate repo, isolated)
- User home directory infrastructure files (Tier 1 universal layer)
- Any internal infrastructure SSoT files outside this PJ root
- Other project trees under the user's local `Projects/` directory (unrelated repos)

### §6.3 Depends (must exist before implementation)

- Stage 1 Discovery approve gate (this doc, user signoff)
- Stage 1.5 prior-art adoption audit (`docs/adr/0001-prior-art-audit.md`, post-approve)
- Stage 2 Requirements (EARS) approve gate (`spec.md` §7, post-approve)
- Stage 3 Design approve gate (`spec.md` §8 + ADRs 0001..0006, post-approve)
- Stage 4 Tasks approve gate (`tasks.md`, post-approve)
- Public SBOM/CycloneDX/SARIF schemas (vendored at the start of Phase 1 implementation)

---

## §7. Phase α exit criteria (sketch — full EARS at Stage 2)

7 binary criteria from the canonical tier rubric, mapped to sbom-pilot:

| # | Criterion | sbom-pilot mapping |
| --- | --- | --- |
| 1 | Working code + tests + CI green | vitest spec count ≥ 500, coverage ≥ 90%, 3-OS CI conclusion=success |
| 2 | Quality README documentation | 10-section structured README + 30-sec pitch + architecture diagram + tech-stack rationale |
| 3 | Original work, not forked / tutorial | self-implemented parser + scanner + emitter + compliance reporter (syft/grype wrapped at boundary only) |
| 4 | Recent + consistent activity | last commit < 30 days, ≥ 30 commits in first 30 days |
| 5 | Technical breadth + depth with rationale | 6+ ADRs (0001-0006+) covering stack / scope / cache / SBOM formats / boundary / exit gate |
| 6 | Domain knowledge / real problem solved | 4-regulation compliance matrix + offline-first design + SMB-tier framing literal evidence |
| 7 | Security + honest framing + AI-era awareness | paid-API 6-layer defense + supply-chain hygiene + offline-first + "Phase α PoC, contract for production" framing |

Full EARS-formatted AC drafted at Stage 2. Writer/Reviewer pattern verify at Phase 1 completion (writer = the implementing session, reviewer = `tier-reviewer` subagent fresh-context verify).

---

## §8. User approve gate (Stage 1)

Please review and confirm or correct:

- **§1 Scope 1-line** — accurate framing?
- **§2.1 Prior art table** — any tool to add / drop?
- **§2.3 Negative prior art** — explicit exclusions OK?
- **§3 Differentiation wedge** — 4-axis niche acceptable, or adjust?
- **§4.5 Compliance cut** — Cut A (4 全件) recommended, OK or different cut?
- **§5.3 Stack** — TypeScript single-route OK, or Go preferred?
- **§6 Boundary / Forbidden / Depends** — accurate?
- **§7 Phase α exit criteria** — 7-binary rubric apply OK?

After approve, sequential progression:

1. Stage 1.5 — prior-art adoption audit (`docs/adr/0001-prior-art-audit.md`)
2. Stage 2 — Requirements (EARS-formatted AC-001..AC-NF-N)
3. Stage 3 — Design (module boundaries, additional ADRs 0002-0006)
4. Stage 4 — Tasks (L0-L9 breakdown, ~30-40 task)
5. Phase 1 — implementation (1 task = 1 commit, Writer/Reviewer round at completion)
6. Phase α exit verify — user gate → PUBLIC flip judgment

---

## §9. Open questions — RESOLVED 2026-05-19 (Stage 1 approve gate clearance)

- **Q1 — Compliance scope cut**: ✅ **Cut A (4 全件)** locked. See §4.5.
- **Q2 — Stack**: ✅ **TypeScript single-route** locked. See §5.3. ADR-0001 at Stage 3 Design.
- **Q3 — Stage 1.5 audit gate model**: ✅ **user-review through** gate before Stage 2 (security audit + user approval principle for any third-party adoption). Red flag (1 件でも) → 採用見送り default、 user explicit override required.
- **Q4 — Phase α exit criteria**: ✅ **7-binary full apply** locked. Scoped subset rejected (rubric §axis-invent forbidden). See §7.

Stage 1.5 prior-art adoption audit (`docs/adr/0001-prior-art-audit.md`) completed 2026-05-19, user-approved (4/4 ✅). syft + grype both adopted as reference-only seeds + opt-in cosign-gated subprocess.

---

## §10. Requirements (Stage 2, EARS-formatted)

> **Status**: drafted 2026-05-19, awaiting user approve gate
> **Convention**: each AC = WHEN/WHILE/IF/WHERE + THE SYSTEM SHALL + observable behavior. AC IDs are stable across stages; Stage 4 tasks reference these IDs in their `_AC:_` annotation.

### §10.1 F-001 — SBOM generation

- **AC-001-1**: WHEN the user runs `sbom-pilot sbom <project-dir>` THE SYSTEM SHALL detect at least one supported package manifest (initial matrix: `package.json` + `pnpm-lock.yaml`, `package-lock.json`, `requirements.txt` + `pip` lockfile, `go.mod` + `go.sum`) and emit a valid SPDX 2.3 JSON document to stdout within 30 seconds on a 1k-dependency project on consumer laptop.
- **AC-001-2**: WHEN the user passes `--format cyclonedx` THE SYSTEM SHALL emit a valid CycloneDX 1.5 JSON document instead of SPDX 2.3, with the same component coverage.
- **AC-001-3**: WHEN the user passes `--output <path>` THE SYSTEM SHALL write the SBOM atomically (temp + rename) to that path and return exit code 0 on success.
- **AC-001-4**: IF the input directory contains no recognised package manifest THEN THE SYSTEM SHALL exit with sysexits `EX_DATAERR` (65) and a single-line diagnostic naming the searched manifest patterns.
- **AC-001-5**: WHERE the SBOM emitter produces a SPDX 2.3 document THE SYSTEM SHALL validate the document against the official SPDX 2.3 JSON schema (vendored at `src/schemas/spdx-2.3.json`) before emission, refusing to write a non-validating document.
- **AC-001-6**: WHERE the SBOM emitter produces a CycloneDX 1.5 document THE SYSTEM SHALL validate against the official CycloneDX 1.5 JSON schema (vendored at `src/schemas/cyclonedx-1.5.json`) before emission.
- **AC-001-7**: WHEN the SBOM contains a dependency with a known SPDX license identifier THE SYSTEM SHALL populate the `licenseConcluded` field (SPDX) / `licenses[*].license.id` field (CycloneDX) using the canonical SPDX License ID (per the SPDX License List).
- **AC-001-8**: WHEN the SBOM is generated THE SYSTEM SHALL include the `documentNamespace` / `serialNumber` field set to a deterministic URN derived from the project + git HEAD hash (when the project is a git repo), so two runs at the same HEAD produce byte-identical SBOMs.

### §10.2 F-002 — Vulnerability scan

- **AC-002-1**: WHEN the user runs `sbom-pilot scan <sbom-path-or-project-dir>` THE SYSTEM SHALL correlate each component against the cached OSV.dev snapshot and emit a finding list (severity + CVE/GHSA ID + affected versions + patched versions when known) within 30 seconds on a 1k-component SBOM.
- **AC-002-2**: WHILE no `--refresh` flag is passed THE SYSTEM SHALL operate entirely offline, using only the locally cached vulnerability database snapshot under `~/.cache/sbom-pilot/vuln-db/` (or the OS-appropriate cache dir).
- **AC-002-3**: WHEN the user passes `--refresh` THE SYSTEM SHALL fetch the latest OSV.dev snapshot over HTTPS, verify its integrity (checksum or signature per OSV.dev guidance), atomically replace the cache, and proceed with scanning.
- **AC-002-4**: WHEN the user passes `--format sarif` THE SYSTEM SHALL emit findings as a SARIF v2.1.0 document validating against the vendored SARIF schema.
- **AC-002-5**: IF any finding has severity `critical` or `high` AND `--fail-on critical,high` flag is passed THEN THE SYSTEM SHALL exit with sysexits `EX_SOFTWARE` (70); otherwise exit 0 regardless of finding count.
- **AC-002-6**: WHERE a finding has a known fix version THE SYSTEM SHALL include a `remediation.suggestedUpgrade` field naming the lowest patched version.
- **AC-002-7**: WHEN the scan completes THE SYSTEM SHALL print a summary footer to stderr listing finding counts by severity, regardless of `--format` (stdout = machine-readable findings, stderr = human summary).

### §10.3 F-003 — Compliance reports (4 regulations)

- **AC-003-1**: WHEN the user runs `sbom-pilot report --standard appi-26-2 <sbom-or-findings-path>` THE SYSTEM SHALL emit a 改正個情法 26-2 incident-reporting evidence document (日本語) including: 該当 dependency / CVE / version / affected period / suggested remediation, formatted to attach to the 個人情報保護委員会 reporting template.
- **AC-003-2**: WHEN the user runs `sbom-pilot report --standard meti-sbom-v2 <sbom-path>` THE SYSTEM SHALL validate the SBOM against the METI SBOM 導入手引き v2.0 minimum-field set (component name / version / supplier / license / hash / dependency relationship / SBOM author / timestamp) and emit a 日本語 field-by-field validator report with PASS/FAIL per field.
- **AC-003-3**: WHEN the user runs `sbom-pilot report --standard ntia <sbom-path>` THE SYSTEM SHALL emit an English NTIA Minimum Elements compliance summary listing the 7 mandatory fields per artifact and their PASS/FAIL state.
- **AC-003-4**: WHEN the user runs `sbom-pilot report --standard eu-cra <sbom-path>` THE SYSTEM SHALL emit an English EU Cyber Resilience Act Annex I compliance checklist (machine-readable SBOM format presence + vulnerability handling pointers) and verify the SBOM is in CycloneDX 1.5 format (CRA-preferred) — refusing with `EX_USAGE` (64) if SBOM is SPDX-only.
- **AC-003-5**: WHERE a compliance report cites a regulation THE SYSTEM SHALL include the regulation version + retrieval date (e.g. `METI SBOM 導入手引き v2.0, 2024-08`) in a citation footer.
- **AC-003-6**: IF the user runs `sbom-pilot report` without `--standard` THEN THE SYSTEM SHALL list the 4 available standards (appi-26-2, meti-sbom-v2, ntia, eu-cra) with one-line descriptions and exit `EX_USAGE` (64).
- **AC-003-7**: WHEN `--standard appi-26-2` is selected AND the SBOM contains dependencies with high/critical CVEs THE SYSTEM SHALL flag those as priority-disclosure items in the output (top of report, separate section).
- **AC-003-8**: WHEN a compliance report is generated THE SYSTEM SHALL emit it atomically (temp + rename) and verify the byte-output is valid UTF-8 with no BOM.

### §10.4 F-005 — CLI UX

- **AC-005-1**: WHEN the user runs `sbom-pilot --help` THE SYSTEM SHALL print a usage summary listing 4 subcommands (`sbom`, `scan`, `report`, `suggest`) + global flags within 100ms on consumer laptop.
- **AC-005-2**: WHEN the user runs an unrecognised subcommand (`sbom-pilot xyz`) THE SYSTEM SHALL print a "did you mean: …" suggestion using Levenshtein-distance ranking and exit `EX_USAGE` (64).
- **AC-005-3**: WHEN the Node version is < 20 LTS THE SYSTEM SHALL refuse to start, print the required version, and exit `EX_CONFIG` (78).
- **AC-005-4**: WHERE the CLI writes to stdout AND stdout is a TTY THE SYSTEM SHALL strip ANSI escape sequences and C0 control chars from any user-supplied content before emission (output-sanitization layer).
- **AC-005-5**: WHEN the user passes `--version` THE SYSTEM SHALL print the package version + the git commit hash baked at build time, and exit 0.

### §10.5 Non-functional requirements

#### §10.5.1 Paid-API 6-layer defense

- **AC-NF-1 (Constructor gate)**: IF a paid LLM provider client is constructed without both `<PROVIDER>_API_KEY` env-var AND `SBOM_PILOT_LLM_PROVIDER=<provider>` env-var THEN THE SYSTEM SHALL refuse construction and raise a non-retryable error.
- **AC-NF-2 (Pre-flight reserve)**: WHEN a paid LLM request is about to dispatch THE SYSTEM SHALL check 3 ceilings (token-count / request-count / cost-estimate) against env-var-configured limits; IF any limit would be exceeded THEN THE SYSTEM SHALL refuse the request without dispatch.
- **AC-NF-3 (Key non-leak)**: WHEN a paid LLM provider error is surfaced THE SYSTEM SHALL mask the API key to its first 6 characters + `…` in any log / error message / stack trace.
- **AC-NF-4 (CI auto-call ban)**: WHILE tests are running (`NODE_ENV=test` or vitest detected) THE SYSTEM SHALL throw on any un-stubbed `fetch` call to a paid LLM provider domain.
- **AC-NF-5 (Default mock)**: WHEN the user runs any CLI subcommand without explicitly setting `SBOM_PILOT_LLM_PROVIDER` THE SYSTEM SHALL auto-fallback to the mock provider; no paid request shall be dispatched.
- **AC-NF-6 (Credit-card-required service ZERO)**: WHERE this PJ adds any external dependency THE SYSTEM SHALL verify the dependency has a free tier sufficient for the project's usage; IF the dependency requires a credit card to enable any used feature THEN adoption is refused.

#### §10.5.2 Credential / cosign / license (lessons from ADR-0001)

- **AC-NF-credentials**: WHEN the report or sbom emitter writes to file or stdout THE SYSTEM SHALL scrub registry credentials and known-credential-pattern substrings (`Bearer …`, `password=…`, `_KEY=…`, `_TOKEN=…`, `_SECRET=…`, AWS access key ID `AKIA[0-9A-Z]{16}`) before emission; a regression test SHALL inject a synthetic credential into input fixtures and assert ZERO leakage in output JSON.
- **AC-NF-cosign-gate**: WHEN the user passes `--use-syft` or `--use-grype` THE SYSTEM SHALL verify the spawned binary's cosign signature against the published Anchore public key before invocation; IF verification fails THEN refuse with `EX_NOPERM` (77).
- **AC-NF-license-attribution**: WHERE Anchore prior-art has informed an implementation module THE SYSTEM SHALL include a `NOTICE` file entry citing the Apache-2.0 origin per the License's §4 attribution requirement.

#### §10.5.3 Offline-first / cross-OS / supply-chain hygiene

- **AC-NF-offline**: WHILE no `--refresh` flag is passed AND the cache exists THE SYSTEM SHALL operate with zero outbound network calls (verified by a test that intercepts `fetch` / `node:net` and asserts no connection attempts).
- **AC-NF-cross-os**: WHERE CI runs THE SYSTEM SHALL execute the full test matrix on Linux, macOS, and Windows, with all paths normalised via `node:path` (no string concatenation of separators).
- **AC-NF-pinned-deps**: WHEN dependencies are installed THE SYSTEM SHALL use only the committed lockfile (`pnpm-lock.yaml`); CI SHALL run `pnpm install --frozen-lockfile` and fail on drift.
- **AC-NF-audit-gate**: WHEN CI runs THE SYSTEM SHALL fail on `pnpm audit --audit-level=high` (any high or critical advisory blocks merge).
- **AC-NF-engine-strict**: WHEN dependencies are installed THE SYSTEM SHALL enforce Node 20 LTS minimum via `engines.node` + `.npmrc` `engine-strict=true`.
- **AC-NF-no-credential-read**: WHILE the CLI runs THE SYSTEM SHALL NOT read from `.env`, `~/.aws/credentials`, `~/.npmrc`, `~/.docker/config.json`, or any other credential file path by default; opt-in is only via explicit CLI flag (none planned for Phase α).

### §10.6 Coverage matrix (AC ↔ Phase α exit criterion)

| Phase α criterion | AC IDs |
| --- | --- |
| 1. Working code + tests + CI green | AC-001-1..8, AC-002-1..7, AC-003-1..8, AC-005-1..5 |
| 2. Quality README documentation | (covered by docs work, no functional AC) |
| 3. Original work, not forked | AC-001-* + AC-002-* + AC-003-* (all self-implemented) |
| 4. Recent + consistent activity | (covered by commit cadence, no functional AC) |
| 5. Technical breadth + depth with rationale | AC-NF-* + ADR-0001..0006 |
| 6. Domain knowledge / real problem solved | AC-003-1..8 (4-regulation compliance) |
| 7. Security + honest framing + AI-era awareness | AC-NF-1..6 + AC-NF-credentials + AC-NF-cosign-gate + AC-NF-license-attribution + AC-NF-offline + AC-NF-audit-gate + AC-NF-no-credential-read |

→ All 7 binary criteria have AC coverage. Stage 4 task breakdown will map each task to one or more AC IDs.

### §10.7 EARS approve gate (Stage 2)

Please review the AC list. Approve / correct:

- §10.1 F-001 SBOM generation (8 AC) — manifest matrix OK? format coverage OK?
- §10.2 F-002 Vuln scan (7 AC) — OSV.dev as single DB source OK? `--fail-on` exit-code policy OK?
- §10.3 F-003 Compliance reports (8 AC) — 4-regulation per-standard subcommand pattern OK?
- §10.4 F-005 CLI UX (5 AC) — sysexits-aligned exit codes OK?
- §10.5 Non-functional (15 AC) — paid-API 6-layer + credentials + cosign + license + offline + supply-chain hygiene OK?
- §10.6 Coverage matrix — Phase α criterion ↔ AC mapping accurate?

After approve, Stage 3 Design kickoff (module boundaries lock + ADRs 0001 stack / 0002 compliance format / 0003 vuln-cache / 0004 SBOM format support / 0005 module boundary / 0006 Phase α exit gate).
