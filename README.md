# sbom-pilot

> **Defensive-first CLI for SBOM + vulnerability scanning + JP/US/EU
> compliance reports.** Generate SPDX 2.3 / CycloneDX 1.5 from a
> project's lockfiles, correlate against an offline OSV cache, emit
> SARIF for code-scanning dashboards, and produce per-regulation
> compliance reports (改正個情法 26-2 / METI SBOM v2.0 / NTIA Minimum
> Elements / EU CRA Annex I). No paid services, no credit card
> required, no network egress on the default path. Built for individual
> developers and SMBs who need to ship the same SBOM-and-vuln-report
> deliverables an enterprise security team produces — without the
> enterprise toolchain.

[![ci](https://github.com/leagames0221-sys/sbom-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/leagames0221-sys/sbom-pilot/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://github.com/leagames0221-sys/sbom-pilot/actions/workflows/scorecard.yml/badge.svg)](https://github.com/leagames0221-sys/sbom-pilot/actions/workflows/scorecard.yml)
[![CodeQL](https://github.com/leagames0221-sys/sbom-pilot/actions/workflows/codeql.yml/badge.svg)](https://github.com/leagames0221-sys/sbom-pilot/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 1. Problem

Supply-chain security is now a regulatory requirement, not just a best
practice:

- **Japan**: 改正個人情報保護法 26-2 (2022 in force) mandates
  incident-class reporting that, in practice, requires a versioned
  component inventory of the system that leaked. METI's SBOM 導入手引き
  v2.0 (2024-08) sets the minimum-field baseline for that inventory.
- **United States**: NTIA Minimum Elements (per Executive Order 14028)
  defines what an SBOM must contain for federal procurement.
- **European Union**: Cyber Resilience Act (CRA, Annex I) extends
  similar obligations to "products with digital elements" sold into
  the EU, with phased enforcement through 2027.

Enterprise security teams have the budget for paid SCA platforms.
Individual developers and SMBs do not — but the legal obligations
apply identically. `sbom-pilot` exists to close that gap with a
single zero-cost CLI.

## 2. Quick start

This is a Phase α PoC. The package is **not yet published to the npm
registry** — Phase α runs from a local clone. The `npm install -g`
path will activate after the Phase α PUBLIC-flip + first
`v0.1.0` tag.

```bash
# Run from a local checkout (current Phase α path):
git clone https://github.com/leagames0221-sys/sbom-pilot.git
cd sbom-pilot
pnpm install --frozen-lockfile
pnpm build                          # compiles src/ → dist/
node dist/cli/index.js --help       # or: pnpm exec tsx bin/sbom-pilot.ts --help
```

After Phase α PUBLIC flip + npm publish:

```bash
# npm install -g sbom-pilot     # ← available once Phase α tags v0.1.0
# sbom-pilot --help
```

Subcommand examples (invoke via the resolved binary, abbreviated as
`sbom-pilot` below):

```bash
# Generate an SPDX 2.3 SBOM from a project directory
sbom-pilot sbom ./my-project --format spdx > sbom.spdx.json

# Scan the project for known vulnerabilities (offline DB)
sbom-pilot scan ./my-project --output findings.sarif --fail-on critical,high

# Produce a Japan APPI 26-2 compliance report
sbom-pilot report ./my-project --standard appi-26-2 > report.txt

# Get an upgrade suggestion for a specific advisory (Ollama-default)
sbom-pilot suggest GHSA-1234-5678-90ab
```

No flags require an API key. No subcommand writes credentials.
`scan` runs with zero network egress by default. The `--refresh`
flag is reserved for a forthcoming vuln-db refresh script (T-29/T-30);
in the current Phase α build it is a no-op that emits a stderr advisory
and proceeds with the existing cache. Populate / update the cache
manually until the refresh wiring lands.

## 3. Subcommands

| Subcommand | Purpose | Default output | Exit policy |
|---|---|---|---|
| `sbom <project-dir>` | Emit SPDX 2.3 or CycloneDX 1.5 from npm / pnpm / pip / go.mod manifests | stdout (or `--output <path>` atomic) | `EX_OK` on success, `EX_DATAERR` on manifest-detection failure |
| `scan <project-dir>` | Correlate against offline OSV cache, emit SARIF 2.1.0 + stderr summary | stdout SARIF + stderr table | `EX_OK` unless `--fail-on <levels>` matches a finding |
| `report <project-dir>` | Generate per-regulation compliance report (appi-26-2 / meti-sbom-v2 / ntia / eu-cra) | stdout text | `EX_USAGE` if `--standard` missing |
| `suggest <advisory-id>` | Free-text upgrade suggestion via local LLM (Ollama default, mock fallback) | stdout text | `EX_OK` on success, `EX_TEMPFAIL` on provider misconfig |

All subcommands ship a `--help` listing. Try `sbom-pilot <subcommand> --help`.

Global flags: `--no-color` strips ANSI escapes from stdout/stderr;
`-q` / `--quiet` suppresses informational stderr (errors still
surface); `-V` / `--version` prints the version string.

## 4. Architecture

5-layer one-way dependency direction (per ADR-0006):

```
┌─────────────────────────────────────────────────────────┐
│  Layer 5 — CLI                                          │
│  src/cli/ + bin/sbom-pilot.ts                          │
│  commander setup, exit codes, --help, did-you-mean,    │
│  --version, output sanitization                        │
├─────────────────────────────────────────────────────────┤
│  Layer 4 — Emitters                                     │
│  src/emitters/                                          │
│  spdx-2.3.ts / cyclonedx-1.5.ts / sarif-2.1.0.ts        │
│  compliance/{appi-26-2,meti-sbom-v2,ntia,eu-cra}.ts     │
├─────────────────────────────────────────────────────────┤
│  Layer 3 — Scanners                                     │
│  src/scanners/                                          │
│  vuln-db.ts / correlator.ts / severity.ts               │
├─────────────────────────────────────────────────────────┤
│  Layer 2 — IR (intermediate representation)             │
│  src/ir/                                                │
│  sbom-ir.ts / schemas.ts (zod) / severity.ts (vocab)    │
├─────────────────────────────────────────────────────────┤
│  Layer 1 — Parsers                                      │
│  src/parsers/                                           │
│  npm.ts / pnpm.ts / pip.ts / go-mod.ts                  │
└─────────────────────────────────────────────────────────┘

  Side modules:
    src/providers/llm/  — Ollama, mock, paid-API defense stub
    src/schemas/        — vendored SPDX / CycloneDX / SARIF JSON schemas
    src/util/           — atomic write, ANSI strip, credential scrub
    src/exit-codes.ts   — sysexits enum
```

**Direction**: CLI → Emitters → IR ← Scanners ← Parsers. Five
literal forbidden edges (Parsers→Emitters, Scanners→Parsers,
IR→anything, Emitters→Scanners, anything→CLI) are CI-gated via
`dependency-cruiser` (`.dependency-cruiser.cjs`). See
[`docs/adr/0006-module-boundary.md`](docs/adr/0006-module-boundary.md)
for the full rationale.

### Tech stack (literal lock, per ADR-0002)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict + `exactOptionalPropertyTypes`) | Sibling reusable patterns; zod + ajv ecosystem maturity |
| Runtime | Node.js 20 LTS | LTS coverage through 2026-04; `engines.node` enforced |
| Package manager | pnpm 10 | Lockfile committed, `--frozen-lockfile` in CI, audit-gate in workflow |
| Test framework | vitest 3 | ESM-native, TS first-class, snapshot built-in |
| CLI parser | commander 13 | Mature, MIT-licensed, sysexits-compatible exit override |
| Schema validation | ajv 8 + ajv-formats | RFC-compliant JSON schema 2020-12 + format validators |
| Runtime validation | zod 3 | Type-narrowing parser for IR-shape gating |

## 5. Compliance support

Four reports are first-class, each with golden fixtures and SARIF-
gating where applicable:

| Standard | Output language | AC-ID | Reference |
|---|---|---|---|
| 改正個情法 第26条の2 | Japanese | AC-003-1 + AC-003-7 | 個人情報保護委員会 ガイドライン |
| METI ソフトウェア管理に向けた SBOM 導入手引き v2.0 | Japanese | AC-003-2 | METI 2024-08 publication |
| NTIA Minimum Elements | English | AC-003-3 | U.S. EO 14028 / NTIA 2021 |
| EU Cyber Resilience Act Annex I | English | AC-003-4 | Regulation (EU) 2024/2847 |

Each compliance emitter is independently testable; the
`tests/golden/compliance/` corpus pins the output shape so a
regulatory drift is caught at PR review, not at audit time.

## 6. Paid-API + supply-chain defense

The project is built around four code-level defenses plus two
architectural constraints (per ADR-0002 §"Tradeoffs accepted" + spec.md
§10.5 AC-NF-1..6, matching the inline comment in
[src/providers/llm/paid-defense.ts](src/providers/llm/paid-defense.ts)):

1. **Constructor gate** — a paid LLM provider is only instantiable when
   both `<PROVIDER>_API_KEY` *and* `SBOM_PILOT_LLM_PROVIDER=<provider>`
   are present in the environment. Either alone refuses construction.
2. **Pre-flight reserve** — three ceilings (token / request / cost USD)
   plus a poisoned-state flag block silent runaway.
3. **Key non-leak** — error messages mask the API key to its first 6
   characters; stack-trace dumps never surface the secret.
4. **CI auto-call ban** — under `CI=true` or any `*_TEST_*` env, the
   global `fetch` is trapped and throws on the first un-stubbed call.
   A regression test (`tests/regression/paid-api-blocking.test.ts`)
   asserts this stays wired.
5. **Default provider = mock** — every subcommand entry point falls
   back to the mock provider when no LLM is configured, so the CLI
   works offline by default.
6. **No-credit-card-required** — every dependency (runtime + CI + LLM)
   has a documented free tier sufficient for the project. No path in
   the codebase reads from a paid service without an explicit user
   opt-in.

Supply-chain hygiene additions:

- `pnpm install --frozen-lockfile` in CI (3-OS matrix).
- `pnpm audit --audit-level=high` is a CI gate.
- `dependency-cruiser` lints the 5 forbidden architectural edges.
- OpenSSF Scorecard + CodeQL + Dependabot are wired (PUBLIC flip
  activates SARIF publication to the Security tab automatically).
- Pre-commit hook (`scripts/check_forbidden_tokens.py`) blocks the
  channel-B mask list before commit.

## 7. Security

See [`SECURITY.md`](SECURITY.md) for the coordinated-disclosure policy
and supported-version table.

Operational hardening:

- **Atomic writes** — every emitter writes via `atomicWrite()`
  (temp-rename pattern). A mid-write process kill leaves zero partial
  files on disk.
- **Credential scrubbing** — `src/util/credential-scrub.ts` masks
  `Bearer …`, `AWS_…`, `*_KEY=…`, `password=…` patterns at the
  emitter boundary. Direct lesson from CVE-2025-65965 (grype
  GHSA-6gxw-85q2-q646 registry credential disclosure); see
  [`NOTICE`](NOTICE) §1.
- **Cosign gate on opt-in subprocess** — `--use-syft` and
  `--use-grype` (T-39) verify the local Anchore binary's cosign
  signature before spawning. Verification failure → `EX_NOPERM`,
  no subprocess.

## 8. Development

Prerequisites: Node.js ≥ 20, pnpm ≥ 10. Optional: Ollama
(`gemma3:4b` recommended) for the `suggest` subcommand's LLM path —
without it the subcommand falls back to the mock provider.

```bash
# Install + verify
pnpm install --frozen-lockfile
pnpm run typecheck      # tsc --noEmit (strict, exactOptionalPropertyTypes)
pnpm run test           # 607 vitest specs (47 test files)
pnpm run test:coverage  # with v8 coverage thresholds (line/function/statement ≥ 90, branch ≥ 85)
pnpm run lint:deps      # ADR-0006 5-edge dependency-cruiser lint
pnpm run audit          # pnpm audit --audit-level=high
pnpm run build          # tsc -p tsconfig.build.json → dist/
```

Repository layout:

```
.
├── bin/                 # CLI entry shebang (sbom-pilot.ts)
├── src/                 # 5-layer source (per ADR-0006)
├── tests/               # unit + e2e + regression + golden corpora
├── docs/adr/            # 7 ADRs (0001-0007, all Accepted)
├── scripts/             # python pre-commit + vuln-db refresh
├── .github/workflows/   # ci + scorecard + codeql
├── .claude/             # PJ-internal memory bank (Tier 2, gitignored)
├── spec.md              # Spec SSoT (Stage 1-4 cleared)
├── tasks.md             # L0-L9 40-task breakdown
├── CHANGELOG.md         # Keep-a-Changelog format
├── NOTICE               # Apache-2.0 attributions (Anchore prior-art + schemas)
└── LICENSE              # MIT
```

Design history lives under `docs/adr/` (one Markdown file per
decision, in the [ADR pattern by Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)).
Each ADR is dated and contains its decision context, rationale,
alternatives considered, tradeoffs accepted, and reversibility note.

## 9. Testing

Test pyramid:

- **Unit** (`tests/unit/`) — pure-function, fixture-driven, parser
  + IR + emitter + scanner + CLI surface.
- **Golden** (`tests/golden/`) — pinned output snapshots for each
  SBOM/SARIF/compliance emitter. Regenerate intentionally; do not
  auto-overwrite.
- **E2E** (`tests/e2e/`) — `cli-help` / `cli-sbom` / `cli-scan` /
  `cli-report` / `cli-suggest` invoke the CLI from a shell-like
  context and assert on stdout + exit code + atomic-write effects.
- **Regression** (`tests/regression/`) — paid-API CI auto-call ban
  is locked in as a regression suite (`paid-api-blocking.test.ts`).
- **Lint** (`tests/unit/lint/`) — `dependency-direction.test.ts`
  creates a synthetic parser→emitter import in a tmp dir and asserts
  the dependency-cruiser CLI exits non-zero with the literal rule
  name, proving the gate is active.

The 3-OS CI matrix (Ubuntu / macOS / Windows) runs typecheck →
test:coverage → lint:deps → audit on every PR + push to main.

## 10. License + attribution

- **License**: [MIT](LICENSE) © 2026 tomohiro takada.
- **Third-party attribution**: see [`NOTICE`](NOTICE) for the literal
  Apache-2.0 §4(d) acknowledgement covering Anchore prior-art
  (syft + grype), vendored SPDX / CycloneDX / SARIF JSON schemas, and
  runtime npm dependency licensing snapshots.
- **Disclosure policy**: see [`SECURITY.md`](SECURITY.md).
- **Phase α PoC notice**: this is a Phase α portfolio project,
  developed as a focused implementation sprint over a short window
  (the L0..L9 layer build sits on top of a Stage 1-4 spec-driven
  workflow whose deliverables — `spec.md`, `tasks.md`, `docs/adr/`
  — predate the implementation commits). For production deployments
  at scale, evaluate the maintained alternatives (`anchore/syft` +
  `anchore/grype`, `aquasecurity/trivy`) and contract a vendor or
  in-house security team for ongoing remediation tracking.
  `sbom-pilot` produces the deliverables; it does not replace the
  security operations workflow that consumes them.

---

Built by [tomohiro takada](https://github.com/leagames0221-sys) — AI
developer / full-stack engineer. Companion to
[mcp-guard](https://github.com/leagames0221-sys/mcp-guard), an MCP
server security scanner from the same Phase α defensive-tooling
sprint.
