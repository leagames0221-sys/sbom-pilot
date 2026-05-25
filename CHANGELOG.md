# Changelog

All notable changes to `sbom-pilot` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- L9 Verify layer wired (T-33..T-37):
  - `.github/workflows/ci.yml` — 3-OS matrix (Ubuntu / macOS / Windows)
    typecheck + test:coverage + lint:deps + audit + drift-check (T-33).
  - `.github/workflows/scorecard.yml` + `codeql.yml` + `dependabot.yml` —
    OpenSSF Scorecard + CodeQL + weekly Dependabot updates. Skip-on-
    private guard keeps Actions tab green pre-PUBLIC-flip (T-34).
  - `.dependency-cruiser.cjs` + `tests/unit/lint/dependency-direction.test.ts` —
    ADR-0006 5-edge forbidden-direction lint, CI-gated, with a
    negative-test verifying the rule fires (T-35).
  - `src/ir/severity.ts` — `OsvSeverityLabel` + severity ordering
    primitives relocated to the IR leaf layer so emitters can sort
    by severity without violating the Emitters→Scanners forbidden
    edge (T-35 side-fix surfaced by the new lint).
  - `NOTICE` — Apache-2.0 §4(d) attribution for Anchore prior-art
    (syft + grype), vendored SPDX / CycloneDX / SARIF JSON schemas,
    and runtime npm dependency licenses (T-36).
  - `README.md` — Phase α-ready 10-section README with 30-sec pitch,
    architecture diagram, tech-stack rationale, subcommand table,
    compliance support matrix, paid-API + supply-chain defense
    summary, security posture, development guide, testing pyramid,
    and license + attribution section (T-37).
  - `tests/unit/branches-extra.test.ts` — 16 targeted unit tests
    raising branches coverage from 81.6% to 86.5% so the 3-OS CI
    matrix passes the branches ≥ 85% threshold.

### Changed
- vitest `testTimeout` lifted from the default 5000ms to 15000ms to
  accommodate Windows-runner subprocess cold-starts (python in
  `mask-script.test.ts`, node in `dependency-direction.test.ts`).
- `src/emitters/compliance/appi-26-2.ts` switched from
  `import { rankBySeverity } from '.../scanners/severity.js'` to an
  inline sort using `compareSeverity` from `src/ir/severity.ts`.
  Behaviour-preserving; resolves ADR-0006 edge-4 violation.

### Fixed
- 3-OS CI compatibility for `dependency-direction.test.ts` —
  spawn cwd set to the tmp fixture dir + relative path arguments
  avoid the Windows backslash absolute-path quirk that surfaced as
  ENOENT in argv parsing.

## [0.1.0] — TBD (Phase α first tag, post-Writer/Reviewer CONFIRM)

### Added
- L0 Foundation (T-01..T-04): TypeScript + pnpm + vitest config,
  sysexits exit-code module, atomic-write + ANSI-strip + credential-
  scrub utilities, channel-B mask pre-commit hook.
- L1 IR (T-05..T-07): SbomIR type + zod schemas + golden round-trip.
- L2 Parsers (T-08..T-12): npm / pnpm / pip / go-mod + dispatcher.
- L3 Schemas (T-13..T-14): vendored SPDX 2.3 + CycloneDX 1.5 + SARIF
  2.1.0 JSON schemas + ajv-driven validator.
- L4 SBOM Emitters (T-15..T-17): shared atomic + citation footer
  helpers, SPDX 2.3 emitter, CycloneDX 1.5 emitter.
- L5 Scanning + SARIF (T-18..T-21): OSV cache loader + atomic
  refresh, component↔advisory correlator, severity ranking +
  dedupe, SARIF 2.1.0 emitter + e2e scan pipeline.
- L6 Compliance (T-22..T-26): per-regulation emitters for 改正個情法
  26-2 + METI SBOM v2.0 + NTIA Minimum Elements + EU CRA Annex I.
- L7 LLM Providers (T-27..T-28): mock + Ollama providers + 6-layer
  paid-API defense + CI auto-call regression test.
- L8 CLI (T-29..T-32): commander scaffold + Node 20 gate +
  `--version`, `sbom` + `scan` + `report` + `suggest` subcommands,
  did-you-mean + global flag wiring.

[Unreleased]: https://github.com/leagames0221-sys/sbom-pilot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/leagames0221-sys/sbom-pilot/releases/tag/v0.1.0
