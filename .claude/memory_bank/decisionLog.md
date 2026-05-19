# decisionLog — sbom-pilot

> Index of architectural / scope / process decisions. Detailed rationale lives
> in `docs/adr/NNNN-*.md` per the ADR pattern; this file is the chronological
> index + 1-line summary.

## Decision index

| # | Date | Decision | ADR | Status |
| --- | --- | --- | --- | --- |
| D-001 | 2026-05-19 | Adopt 4-stage Spec-Driven Workflow (Discovery → Requirements EARS → Design → Tasks) | TBD | Active |
| D-002 | 2026-05-19 | License = MIT | (LICENSE) | Active |
| D-003 | 2026-05-19 | Channel B framing strict, initial commit PRIVATE, PUBLIC flip gated on canonical tier verify | (CLAUDE.md) | Active |
| D-004 | 2026-05-19 | Stack final lock deferred to Stage 1 Discovery ADR-0001 (TS vs Go) | ADR-0001 (pending) | Open |
| D-005 | 2026-05-19 | Pre-commit hardening = base hooks + gitleaks + forbidden-token-mask (mask script wired at Stage 4) | (.pre-commit-config.yaml) | Active |
| D-006 | 2026-05-19 | JP-compliance scope candidates = 改正個情法 26-2 + METI SBOM v2.0 + NTIA Minimum Elements + EU CRA Annex I (final cut at Discovery) | ADR-0002 (pending) | Open |
| D-007 | 2026-05-19 | paid-API 6-layer defense intact, sibling pattern inherit | (CLAUDE.md) | Active |
| D-008 | 2026-05-19 | LLM provider default = Ollama local `gemma3:4b`, mock fallback always available | (CLAUDE.md) | Active |
| D-009 | 2026-05-19 | Offline-first vuln DB cache, network egress opt-in via explicit `--refresh` flag | ADR-0003 (pending) | Open |
| D-010 | 2026-05-19 | Phase α exit gate = Writer/Reviewer pattern with canonical 7-binary rubric, AI self-promotion forbidden, user gate required | (CLAUDE.md) | Active |

## Pending ADRs (to draft during Stage 3 Design)

- **ADR-0001**: Stack selection (TypeScript vs Go) — rationale matrix
- **ADR-0002**: JP-compliance scope cut + reporting format
- **ADR-0003**: Offline-first vuln DB cache architecture
- **ADR-0004**: SBOM format support matrix (SPDX 2.3 + CycloneDX 1.5 + which package ecosystems)
- **ADR-0005**: Detector / scanner module boundary (parser / scanner / emitter / CLI)
- **ADR-0006**: Phase α exit gate + 7 binary criteria mapping

## Reversal log

(empty — no decisions reversed yet)
