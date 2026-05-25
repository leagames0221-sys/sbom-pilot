# systemPatterns — sbom-pilot

> Recurring architectural / coding patterns adopted in this PJ.
> Reference target during implementation to avoid pattern drift.

## Sibling-tool inheritance (mcp-guard → sbom-pilot)

`sbom-pilot` is the second tool in a sibling pair (first = MCP-server security
scanner, sibling product `mcp-guard`). Patterns proven in the sibling are
inherited verbatim unless an explicit ADR documents the deviation.

### Inherited patterns (Stage 4 task scope)

| Pattern | Source (sibling) | sbom-pilot adoption |
| --- | --- | --- |
| Atomic file emitter (temp + rename, partial-write safe) | `src/emitters/atomic.ts` | Stage 4 task |
| SARIF v2.1.0 emitter | `src/emitters/sarif.ts` | Stage 4 task |
| sysexits-aligned CLI exit codes | `src/cli/exit_codes.ts` | Stage 4 task |
| Sequential probe runner with AbortSignal | `src/harness/sequential.ts` | Stage 4 task (renamed for scanner sequencing) |
| Detector dispatch verdict aggregation | `src/detectors/dispatch.ts` | Stage 4 task |
| paid-API 6-layer defense | `src/providers/llm/paid.ts` | Stage 4 task |
| ADR-driven design log | `docs/adr/*.md` | Active (this PJ) |

### Reasons to deviate (require ADR)

- Stack divergence (TS → Go): re-implement, document in ADR-0001
- SBOM-specific schema parsing (SPDX / CycloneDX): no sibling equivalent, original work
- Vulnerability DB cache architecture: no sibling equivalent, original work

## Module boundaries (Stage 3 Design, lockdown target)

```
┌──────────────────────────────────────────────────────────────┐
│ CLI layer (commander or cobra)                                │
│  - subcommands: sbom, scan, report, suggest                   │
│  - exit codes: sysexits-aligned                               │
├──────────────────────────────────────────────────────────────┤
│ Parser layer                                                  │
│  - package-manifest readers (npm / pnpm / pip / go.mod / ...)│
│  - SPDX 2.3 + CycloneDX 1.5 readers                          │
├──────────────────────────────────────────────────────────────┤
│ Scanner layer                                                 │
│  - OSV / NVD / GHSA correlator                               │
│  - severity ranker                                            │
│  - dedupe                                                     │
├──────────────────────────────────────────────────────────────┤
│ Emitter layer                                                 │
│  - SPDX 2.3 emitter (atomic)                                 │
│  - CycloneDX 1.5 emitter (atomic)                            │
│  - SARIF v2.1.0 emitter (atomic)                             │
│  - JP-compliance report emitter                              │
├──────────────────────────────────────────────────────────────┤
│ Provider layer (optional)                                    │
│  - LLM remediation suggester (Ollama default, mock default)  │
│  - paid-API 6-layer defense                                  │
└──────────────────────────────────────────────────────────────┘
```

Final structure locked at Stage 3 Design (ADR-0005).

## Verify priority (PJ-specific, layered on top of inherited default)

1. File system check (lockfile exists, schema files valid)
2. CLI subcommand smoke (`sbom-pilot --help`, `sbom-pilot sbom --dry-run`)
3. Automation test (vitest / go test, snapshot for schemas, golden for reports)
4. Log read (CI artifacts, schema validation reports)
5. Real-dependency smoke (last resort: scan a known-good fixture)

## Anti-patterns (DO NOT)

- Calling the internet during a unit test (every test must work offline)
- Constructing a paid LLM provider without the 2-factor env gate
- Emitting findings without atomic write (corrupt partial files on Ctrl-C)
- Hard-coding regulatory citations (must reference a versioned source)
- Treating CycloneDX and SPDX as interchangeable (semantics differ — see ADR-0004)
- Committing real customer dependency trees to fixtures (synthetic only)
