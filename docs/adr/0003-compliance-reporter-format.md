# ADR-0003: Compliance reporter format — per-standard subcommand + vendored regulation snippets

**Status**: Accepted
**Date**: 2026-05-19
**Stage**: 3 (Design)

## Context

Stage 1 §4 + Stage 2 §10.3 lock 4 regulations as in-scope for compliance reporting:

| Standard | Source | Output language |
| --- | --- | --- |
| 改正個情法 26-2 | 個人情報の保護に関する法律 第 26 条の 2 (incident notification + reporting) | 日本語 |
| METI SBOM 導入手引き v2.0 | METI, 2024-08, minimum-field validator | 日本語 |
| NTIA Minimum Elements | US EO 14028, 2021-07, 7 mandatory fields | English |
| EU CRA Annex I | EU CRA, 2024, Annex I machine-readable SBOM requirements | English |

A naïve approach would emit one combined report covering all 4 standards. The Stage 2 EARS instead requires `report --standard <name>` per-standard. This ADR records the architectural rationale.

## Decision

Per-standard subcommand pattern:

```
sbom-pilot report --standard appi-26-2   <sbom-or-findings>
sbom-pilot report --standard meti-sbom-v2 <sbom>
sbom-pilot report --standard ntia         <sbom>
sbom-pilot report --standard eu-cra       <sbom>
```

Implementation:

- One emitter module per standard at `src/emitters/compliance/<standard>.ts`
- Shared `ComplianceReporter` interface (input: SBOM + findings; output: report struct)
- Regulation text snippets vendored at `src/emitters/compliance/regulation-snippets/<standard>.ts` (versioned strings, retrieval-date stamped)
- Per-standard golden test fixture at `tests/golden/compliance/<standard>/`
- Citation footer literal includes regulation version + retrieval date per AC-003-5

## Rationale

### Why per-standard, not unified

1. **Separation of concerns**: each regulation has different fields, severity emphasis, output language, and update cadence. A unified emitter rapidly accumulates `if (standard === '改正個情法') {...}` branches and becomes the source of bugs.
2. **Golden test per standard**: regulation-text drift (e.g. METI updates to v2.1) needs a localized test fixture, not a multi-tab golden file.
3. **Easy 5th-standard addition**: future support for SP 800-218 / ISM Top 35 / etc. = add one file, one fixture, one CLI alias. No combinatorial refactor.
4. **Output-language clean separation**: 日本語 templates vs English templates do not share helpers; mixing them in one emitter risks character-encoding leak and accidental untranslated literals.

### Why vendored regulation snippets

- **Auditability**: each citation in the output traces to a literal string + version + retrieval date in the source code; reviewers can diff old vs new snapshots.
- **Offline-first**: no runtime fetch of regulatory text; output is reproducible.
- **License hygiene**: regulatory text is generally public-domain or attribution-only; vendoring the snippet with the URL + retrieval date documents compliance.

### Why interface, not class hierarchy

`ComplianceReporter` is a stateless function signature `(input: ReportInput) => ReportOutput`. No inheritance. Tests can call each module directly with no mocking.

## Alternatives considered

### Unified emitter with switch (rejected)

- **Pros**: single entry point, less file sprawl
- **Cons**: rapidly devolves into branchy mess (see Rationale §1); golden tests become unwieldy; adding a 5th standard is a refactor not an additive change
- **Why rejected**: locks in technical debt at the design stage

### Plugin architecture with dynamic loading (rejected)

- **Pros**: 3rd parties could ship out-of-tree standards
- **Cons**: out of scope for Phase α (4 standards in-tree is enough); plugin loading is a supply-chain attack vector; YAGNI
- **Why rejected**: premature abstraction

## Tradeoffs accepted

| Tradeoff | Mitigation |
| --- | --- |
| 4× boilerplate for the report-output struct | shared helpers (severity-section, citation-footer, atomic emit) in `src/emitters/compliance/_shared.ts` |
| Regulation drift requires manual snippet refresh | document the refresh process in `docs/maintenance/regulation-snippets.md`; add a quarterly task; CI checks snippet age (warn at > 12 months) |

## Reversibility

The interface is a function signature, not a heavy abstraction. Combining the 4 emitters back into a unified function is a mechanical refactor if it ever proves necessary. The reverse — splitting a unified emitter — is the painful case, which is why we go split-first.

## References

- `spec.md` §4 (compliance scope) + §10.3 (F-003 AC list)
- `ADR-0001` §Domain-specific design rules
- 改正個情法 第 26 条の 2 (e-Gov public domain reference, version 令和 4 年改正 + 令和 6 年改正)
- METI SBOM 導入手引き v2.0 (2024-08 publication)
- NTIA Minimum Elements (`https://www.ntia.gov/sites/default/files/publications/sbom_minimum_elements_report.pdf`)
- EU CRA Annex I (Regulation (EU) 2024/2847)
