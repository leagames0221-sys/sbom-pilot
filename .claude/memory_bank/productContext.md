# productContext — sbom-pilot

> Why this product exists, who it's for, what problem it solves.
> Updated when scope / target audience / value proposition shifts.

## Why this product exists

Supply-chain attacks (Shai-Hulud, s1ngularity, xz-utils, event-stream,
ua-parser-js, etc.) have surfaced again and again throughout 2024–2026.
Individual developers and SMBs typically can't justify enterprise SBOM tooling
(Snyk, Sonatype, Chainguard) but still face the same supply-chain risk surface.

Open-source tooling (syft + grype, Trivy, OSV-Scanner, dependency-track) is
strong on raw scanning but weak on:

- Localized regulatory reporting (改正個情法 / METI SBOM 導入手引き)
- Offline-first ergonomics (most tools assume always-on network access)
- CLI UX consistency with adjacent security tools (sibling positioning)

`sbom-pilot` fills that niche.

## Target audience

| Audience | Pain | sbom-pilot value |
| --- | --- | --- |
| Individual JP developer | 改正個情法 26-2 incident reporting requires SBOM evidence, no off-the-shelf JP-tooling exists | One-shot CLI emits compliance-aligned reports |
| SMB CTO | Budget < ¥1M/yr for supply-chain tooling, enterprise SaaS priced for Fortune 500 | Free, MIT-licensed, runs on consumer hardware |
| Freelance contractor | Each client needs its own SBOM, no shared infrastructure | Single binary / npm package, no server |
| Educator / OSS maintainer | Wants to teach SBOM hygiene with reproducible artifacts | Offline-first, deterministic output |

## Differentiation axis (final cut at Stage 1 Discovery)

| Axis | sbom-pilot | syft+grype | Trivy | OSV-Scanner |
| --- | --- | --- | --- | --- |
| JP-compliance reporting | ✅ first-class | ❌ | ❌ | ❌ |
| Offline-first default | ✅ | ⚠️ | ⚠️ | ❌ |
| Consumer-laptop CLI ergonomics | ✅ | ✅ | ✅ | ✅ |
| Sibling positioning to MCP/LLM security tool | ✅ | ❌ | ❌ | ❌ |
| Multi-format SBOM (SPDX 2.3 + CycloneDX 1.5) | ✅ planned | ✅ | ⚠️ | ❌ |
| Free / no paid tier required | ✅ MIT | ✅ Apache-2 | ✅ Apache-2 | ✅ Apache-2 |

## Non-goals

- Enterprise multi-tenant deployment (out of scope for Phase α; possible later phase)
- Real-time CI/CD policy enforcement (sbom-pilot emits findings; gate policy is the user's CI's job)
- Replacing OSV / NVD / GHSA as a vulnerability database (sbom-pilot consumes these as inputs)
- Active patching / auto-upgrade of dependencies (suggest remediation only; user applies)

## Success criteria (Phase α exit)

- CLI runs on consumer laptop (Win/macOS/Linux), no GPU required
- Generates valid SPDX 2.3 + CycloneDX 1.5 from at least one major package ecosystem (locked at Discovery)
- Correlates with OSV / NVD / GHSA cached snapshots
- Emits at least one JP-compliance report (改正個情法 26-2 or METI SBOM v2.0)
- Writer/Reviewer 2-round verify with CONFIRM verdict
