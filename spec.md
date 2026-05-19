# sbom-pilot — Specification (Stage 1 Discovery output)

> **Status**: Stage 1 Discovery — awaiting user approve gate
> **Workflow**: 4-stage Spec-Driven Development (Discovery → Requirements (EARS) → Design → Tasks)
> **Last updated**: 2026-05-19

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

### §4.5 Final cut decision needed at approve gate

| Cut option | scope | dev cost | portfolio value |
| --- | --- | --- | --- |
| **Cut A (recommended)**: 4 全件 (改正個情法 + METI + NTIA + EU CRA) | full | ~+4 hours over base | wide JP + intl niche |
| Cut B: JP 2 only (改正個情法 + METI) | narrower | base | JP-only niche |
| Cut C: NTIA + EU CRA only (intl, no JP) | narrower | base | intl-only, loses JP wedge |

→ Recommended single route: **Cut A**. Dev cost increment is modest (compliance reports are mostly templated text + field validation, not novel logic); portfolio value of being the only tool with 4-regulation literal coverage is high.

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

### §5.3 Recommended single route

**Stack = TypeScript (Option A)**.

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

## §9. Open questions for user (final approve gate input)

- **Q1**: Compliance scope cut — A (4 全件 recommended) / B (JP only) / C (intl only) ?
- **Q2**: Stack — TypeScript single-route (recommended) / Go preferred ?
- **Q3**: Should Stage 1.5 prior-art adoption audit gate user-review syft+grype audit verdict before Stage 2, or auto-proceed if Scorecard ≥ 7 ?
- **Q4**: Phase α exit criteria — full 7-binary apply (recommended) or scoped subset for faster ship ?

Awaiting answers to lock §4 / §5 / §7 finally before Stage 1.5 audit kickoff.
