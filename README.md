# sbom-pilot

> Defensive-first CLI for generating Software Bill of Materials (SBOM),
> scanning dependencies for known vulnerabilities, and producing
> compliance-aligned reports for individual developers and SMBs.
>
> **Status**: Stage 1 Discovery in progress. Phase α (★★★ tool tier verify)
> pending. This README will expand with quick-start, architecture diagram,
> and verified metrics once Phase α completes (per `tool_tier_rubric.md`).

## What it does (planned scope, locked at Stage 1 Discovery)

1. **SBOM generation** — emit SPDX 2.3 + CycloneDX 1.5 from a project's
   dependency manifest (npm / pnpm / pip / go.mod / cargo / maven, exact
   matrix decided at Discovery).
2. **Vulnerability correlation** — match the generated SBOM against OSV /
   NVD / GHSA snapshots, report findings with severity + remediation hints.
3. **Compliance reporting** — produce per-regulation reports aligned with:
   - 改正個情法 (Japan APPI 2026, Article 26-2 incident reporting)
   - METI SBOM 導入手引き v2.0 (Japan, 2024-08)
   - NTIA Minimum Elements (US EO 14028)
   - EU Cyber Resilience Act (CRA) Annex I

## Why another SBOM tool?

The decomposed-prior-art seeds for this project are
[anchore/syft](https://github.com/anchore/syft) (SBOM generator) and
[anchore/grype](https://github.com/anchore/grype) (vulnerability scanner).
The differentiation axis (final shape locked at Stage 1 Discovery):

- **JP-compliance-first reporting** — local-language regulatory output
  (改正個情法 / METI), a niche under-served by US-centric tooling.
- **Offline-first** — vulnerability DB snapshots ship in cache form, no
  network egress required for core workflow.
- **Sibling to [mcp-guard](https://github.com/leagames0221-sys/mcp-guard)**
  (MCP server security tool, ★★★ Strong Hire verified 2026-05-19) —
  consistent CLI UX, shared SARIF emitter, shared paid-API 6-layer defense.

## Project status

| Phase | Status |
| --- | --- |
| Stage 1 Discovery | 🚧 In progress (see `spec.md`) |
| Stage 2 Requirements (EARS) | ⏳ Pending |
| Stage 3 Design + ADRs | ⏳ Pending |
| Stage 4 Tasks (L0–L9 breakdown) | ⏳ Pending |
| Phase 1 implementation | ⏳ Pending |
| ★★★ tier verify (Writer/Reviewer pattern) | ⏳ Pending |

## License

[MIT](LICENSE) © 2026 tomohiro takada.

## Security

See [`SECURITY.md`](SECURITY.md) for the disclosure policy and the hardening
posture. This is a security tool — we take its own security posture
seriously.
