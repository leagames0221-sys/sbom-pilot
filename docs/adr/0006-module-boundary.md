# ADR-0006: Module boundary — 5-layer architecture with one-way dependency direction

**Status**: Accepted
**Date**: 2026-05-19
**Stage**: 3 (Design)

## Context

A clean module boundary is essential for:

- Independent testability (unit-test each layer without mocking the world)
- Refactor safety (changes in one layer don't ripple)
- Onboarding clarity (a reviewer can predict where new code goes)

`spec.md` §6 listed file paths but did not formalize the module structure or dependency direction. This ADR locks both.

## Decision

### 5-layer architecture

```
┌────────────────────────────────────────────────────┐
│  Layer 5 — CLI                                      │
│  src/cli/                                           │
│  Entry: bin/sbom-pilot.ts (shebang)                │
│  Modules: command parser, exit codes, --help, did-  │
│  you-mean, --version, output sanitization           │
├────────────────────────────────────────────────────┤
│  Layer 4 — Emitters                                 │
│  src/emitters/                                      │
│  spdx-2.3.ts / cyclonedx-1.5.ts / sarif-2.1.0.ts    │
│  compliance/{appi-26-2,meti-sbom-v2,ntia,eu-cra}.ts │
│  _shared.ts (atomic write, citation, severity)      │
├────────────────────────────────────────────────────┤
│  Layer 3 — Scanners                                 │
│  src/scanners/                                      │
│  vuln-db.ts (OSV cache + refresh)                   │
│  correlator.ts (component ↔ advisory match)         │
│  severity.ts (ranking + dedupe)                     │
├────────────────────────────────────────────────────┤
│  Layer 2 — IR (intermediate representation)         │
│  src/ir/                                            │
│  sbom-ir.ts (Component / Relationship / IR)         │
│  zod schemas for IR validation                      │
├────────────────────────────────────────────────────┤
│  Layer 1 — Parsers                                  │
│  src/parsers/                                       │
│  npm.ts / pnpm.ts / pip.ts / go-mod.ts              │
│  spdx-reader.ts (read existing SPDX → IR)           │
│  cyclonedx-reader.ts (read existing CycloneDX → IR) │
└────────────────────────────────────────────────────┘

  Side modules (cross-cutting):
    src/providers/llm/  — Ollama, mock, paid-API stub
    src/schemas/        — vendored SPDX/CycloneDX/SARIF JSON schemas
    src/util/           — atomic writer, ANSI strip, credential scrubber
    src/exit-codes.ts   — sysexits enum
```

### Dependency direction (strict)

```
CLI → Emitters → IR ← Scanners ← Parsers
           ↓        ↑
        Providers  Util
```

- **CLI** depends on Emitters + Scanners (the two top-level user-facing operations)
- **Emitters** read IR, no awareness of how IR was built
- **Scanners** read IR, no awareness of where IR came from
- **Parsers** write IR, no awareness of who reads it
- **IR** has zero dependencies (pure data + zod schema)
- **Providers** are pulled in only by emitters that produce remediation suggestions (LLM-enriched output)
- **Schemas** are imported wherever validation happens
- **Util** is a leaf; nothing imports the wrong direction

### Forbidden dependency edges (literal):

- ❌ Parsers → Emitters (parsers cannot know about output formats)
- ❌ Scanners → Parsers (scanners receive an IR, not raw manifests)
- ❌ IR → anything (IR is leaf data)
- ❌ Emitters → Scanners (emitters serialize, do not scan)
- ❌ Anything → CLI (CLI is the top, nothing else imports from it)

These edges will be enforced by a dependency-direction lint at Stage 4 (e.g. [`dependency-cruiser`](https://github.com/sverweij/dependency-cruiser) config + CI gate).

### Public API surface (Phase α)

- **CLI**: `bin/sbom-pilot.ts` only — the literal Phase α consumer surface
- **External (npm consumers, library imports)**: **deferred to Phase β**.
  `src/index.ts` is a scaffolding placeholder at Phase α; library-style
  `import { generate, scan, report } from 'sbom-pilot'` is not exposed
  until Phase β wires the wrapper exports around the existing
  subcommand actions. This is intentional — Phase α scope is the
  defensive-first CLI; the library surface is a separate adoption
  pathway with its own semver / breaking-change discipline.
- **Everything else**: internal, no semver guarantees.

## Rationale

### Why 5 layers, not 3 or 7

- 3 layers (parser / core / cli) hides too much; "core" becomes a god-module
- 7+ layers introduces ceremony without benefit at Phase α scale
- 5 layers maps directly to the 4 acceptance-criteria functional groups (F-001 / F-002 / F-003 / F-005) plus the IR seam

### Why IR as Layer 2 (not Layer 0 or wrapping)

- IR is a contract, not a service. Placing it between parsers (producers) and scanners+emitters (consumers) makes the dataflow explicit.
- Putting IR at "Layer 0" (universal leaf) would suggest emitters import it like a stdlib; instead emitters consume it as a deliverable from upstream.

### Why one-way dependency direction

- Makes circular imports structurally impossible
- New code reviewer can predict imports just from the layer label
- Enables future module-by-module reimplementation (e.g. Go pivot per ADR-0002 reversibility)

## Alternatives considered

### Hexagonal (ports + adapters) (rejected for Phase α)

- **Pros**: maximum testability, swap-in/swap-out cleanliness
- **Cons**: ceremony overhead, hexagonal terminology friction for a CLI of this size
- **Why rejected for Phase α**: YAGNI; layered architecture suffices. Migration to hexagonal is feasible post-Phase α if scale demands it.

### Flat `src/` (no subdirs) (rejected)

- **Pros**: zero ceremony
- **Cons**: by 40+ files becomes unsearchable; testing requires manual mock construction
- **Why rejected**: Stage 4 estimates ~40 source files, flat is below the legibility threshold

### Mono-package vs multi-package workspace (rejected)

- **Pros**: enforces boundaries via package.json
- **Cons**: pnpm workspace adds CI complexity, npm publish multi-package overhead
- **Why rejected**: directory-level boundary + dependency-cruiser lint is sufficient

## Tradeoffs accepted

| Tradeoff | Mitigation |
| --- | --- |
| Layer boundaries can be violated by an incautious import | dependency-cruiser lint gate in CI |
| 5 directories for ~40 files (~8 files per layer) | layer label predicts location; barrel `index.ts` per layer for clean external imports |
| IR shape changes ripple to all layers above and below | minimal IR + zod schema versioning + golden tests per layer |

## Reversibility

Layers are directories + lint rules, not packages. Flattening or restructuring is a mechanical refactor (move + update imports). The IR contract is the only piece that requires care to change; ADR-0005 already addresses IR reversibility.

## References

- `spec.md` §6 (Boundary / Forbidden / Depends file structure plan)
- `spec.md` §10 (38 AC, layered acceptance criteria align to layered modules)
- dependency-cruiser: `https://github.com/sverweij/dependency-cruiser`
