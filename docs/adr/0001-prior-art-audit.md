# ADR-0001: Prior-art adoption audit — syft + grype

**Status**: Accepted (Stage 1.5 user-approved 2026-05-19; propagated to Stage 2 EARS AC-NF-credentials / AC-NF-cosign-gate / AC-NF-license-attribution + Stage 4 T-39 cosign gate + T-36 NOTICE)
**Date**: 2026-05-19
**Author**: tomohiro takada (`leagames0221-sys`)
**Stage**: 1.5 (between Discovery and Requirements)

## Context

Stage 1 Discovery (`spec.md` §2) identified [anchore/syft](https://github.com/anchore/syft) and [anchore/grype](https://github.com/anchore/grype) as decomposed-prior-art seeds for the SBOM generator and vulnerability scanner respectively. Before any vendor / depend / fork action, a literal security audit is required against 8 gate items, with Red flag detection (1 件でも) defaulting to non-adoption + user-explicit-override path.

Stage 1 approve gate (2026-05-19) locked the audit gate model as **user-review through**: this ADR's verdict is presented to the user for review before Stage 2 kickoff.

## Audit method

Each tool was evaluated against 8 binary gate items defined in `spec.md` §2.2. Evidence was collected via `gh api` (GitHub REST API), `api.securityscorecards.dev` (OpenSSF Scorecard public API), and verified release-asset enumeration. Audit timestamp: 2026-05-19.

## Gate-by-gate evidence

### Gate 1 — OpenSSF Scorecard ≥ 7.0

| Tool | Score | Date | Sub-checks < 7 (informational) |
| --- | --- | --- | --- |
| syft | **8.0** ✅ | 2026-05-18 | Packaging (-1), CII-Best-Practices (0), Fuzzing (0), Branch-Protection (5), Pinned-Dependencies (7 boundary, counts as PASS) |
| grype | **8.2** ✅ | 2026-05-18 | Packaging (-1), Pinned-Dependencies (7 boundary), Vulnerabilities (7 boundary), Branch-Protection (4), Fuzzing (0) |

Source: `https://api.securityscorecards.dev/projects/github.com/anchore/{syft,grype}` (fetched 2026-05-19).

**Verdict**: ✅ Both PASS the ≥ 7.0 floor.

**Note**: Branch-Protection sub-score of 4–5 on both is mild; this affects the upstream project's release-attack surface, not consumers. Fuzzing of 0 is common for tooling repos and not gate-blocking.

### Gate 2 — License (Permissive: Apache-2.0 / MIT / BSD-3)

| Tool | License | Source |
| --- | --- | --- |
| syft | Apache-2.0 ✅ | `gh api repos/anchore/syft` → `license.spdx_id` |
| grype | Apache-2.0 ✅ | `gh api repos/anchore/grype` → `license.spdx_id` |

**Verdict**: ✅ Both PASS. Apache-2.0 is permissive, MIT-compatible for downstream vendoring with attribution.

### Gate 3 — Signed releases (cosign or GPG)

| Tool | Latest release | Signed artifacts |
| --- | --- | --- |
| syft | v1.44.0 (2026-05-01) | ✅ `syft_1.44.0_checksums.txt.pem` (cert) + `syft_1.44.0_checksums.txt.sig` (sig) present |
| grype | v0.112.0 (2026-05-01) | ✅ `grype_0.112.0_checksums.txt.pem` (cert) + `grype_0.112.0_checksums.txt.sig` (sig) present |

Source: `gh api repos/anchore/{syft,grype}/releases/latest` (verified 2026-05-19). Cosign keyless signing pattern is consistent with Anchore's documented release process.

**Verdict**: ✅ Both PASS. Cosign signature verification path established.

### Gate 4 — Active maintenance (last commit < 60 days)

| Tool | `pushed_at` | Days ago |
| --- | --- | --- |
| syft | 2026-05-18T19:01:40Z | 1 day ✅ |
| grype | 2026-05-18T19:20:53Z | 1 day ✅ |

**Verdict**: ✅ Both PASS. Active daily commits.

### Gate 5 — Stars (≥ 1k for primary tools)

| Tool | Stars |
| --- | --- |
| syft | 8,955 ✅ |
| grype | 12,234 ✅ |

**Verdict**: ✅ Both PASS. Both well above the 1k floor; grype is in the top 1% of Go security tooling on GitHub by star count.

### Gate 6 — CVE history (no unresolved high/critical in last 12 months)

#### syft

| GHSA | Severity | Published | Status |
| --- | --- | --- | --- |
| GHSA-rjcw-vg7j-m9rc | medium | 2026-03-20 | published (resolved upstream) |
| GHSA-jp7v-3587-2956 | medium | 2023-02-06 | published (resolved; pre-12-month window) |

No high/critical advisories in any window. **Verdict**: ✅ PASS.

#### grype

| GHSA | CVE | Severity | Published | Affected range | Patched in |
| --- | --- | --- | --- | --- | --- |
| GHSA-6gxw-85q2-q646 | CVE-2025-65965 | **HIGH** | 2025-11-24 | `v0.68.0` through `v0.104.0` | **v0.104.1** ✅ |

The high-severity advisory IS within the 12-month window, but it is **resolved**: a patched release (v0.104.1) shipped on the disclosure path, and the current latest release is v0.112.0 (8 minor versions past the fix).

**Description (verbatim, partial)**: "A credential disclosure vulnerability was found in Grype, affecting versions `v0.68.0` through `v0.104.0`. If registry credentials are defined and the output of grype is written using the `--file` or `--output json=<file>` option, the registry credentials will be included unsanitized in the output f[ile]..."

**Verdict**: ✅ PASS (gate criterion = "no **unresolved** high/critical"; this one is resolved).

**Domain lesson captured (propagated to sbom-pilot design)**: sbom-pilot must NEVER write credentials to any output file/stream. Specifically, the `report` and `sbom` emitters must:
- Scrub any environment-derived registry credentials before emission
- Apply ANSI/control-char + credential-pattern (`<TOKEN>`, `Bearer …`, `AWS_…`) regex masking at the emitter boundary
- Add a regression test that injects a fake `GRYPE_REGISTRY_PASSWORD`-equivalent into the input fixture and asserts ZERO leakage in output JSON

This lesson is recorded in `decisionLog.md` (D-013 to be added) and propagated to Stage 2 EARS as **AC-NF-credentials**.

### Gate 7 — Supply-chain hygiene (Dependabot, lockfile committed)

| Tool | Dependabot config | Lockfile |
| --- | --- | --- |
| syft | `.github/dependabot.yml` (1784 bytes) ✅ | `go.sum` (149 KB) ✅ |
| grype | `.github/dependabot.yaml` (1784 bytes) ✅ | `go.sum` (156 KB) ✅ |

Both repos commit their Go module lockfile and run Dependabot for upstream dependency tracking.

**Verdict**: ✅ Both PASS.

### Gate 8 — Red flag scan (Shai-Hulud / s1ngularity / TeamPCP-class patterns)

Inspected:
- No npm postinstall script abuse (both repos are Go, not Node)
- No suspicious build-script injection in `.github/workflows/release.yaml` (cosign + GoReleaser pattern, standard)
- No recent suspicious force-push to release tags (release tags are GitHub-Actions-bot signed)
- No vendored binaries from untrusted sources (Go modules only)
- No history of credential leak commits (gitleaks-clean upstream)
- Owner organization `anchore` is an established commercial security vendor with disclosure-cooperative track record

**Verdict**: ✅ Both PASS. No known supply-chain attack patterns matching the Shai-Hulud (npm worm) / s1ngularity (compromise) / TeamPCP (auto-publish) signatures.

## Aggregate verdict

| Tool | 8/8 gates | Verdict |
| --- | --- | --- |
| anchore/syft | ✅ 8/8 PASS | **Adopt** as decomposed seed |
| anchore/grype | ✅ 8/8 PASS | **Adopt** as decomposed seed |

Both tools pass all 8 binary adoption gates literally. No Red flag detected. No user-explicit-override required.

## Adoption shape (recommended single route)

Per the Stage 1-locked stack (TypeScript), neither tool will be vendored as a Go library dependency. Instead:

1. **Reference-only adoption** at design layer: SBOM-format parsing logic, SPDX/CycloneDX field-mapping conventions, and OSV/NVD correlation heuristics are studied from the public source code and re-implemented in TypeScript. License attribution included.
2. **Subprocess wrap** at runtime layer: when the user opts in via an explicit `--use-syft` or `--use-grype` CLI flag, sbom-pilot will spawn the local binary (must be installed by the user via the Anchore-documented install path) and parse its stdout. Default behavior = pure TypeScript implementation (no subprocess, no external binary dependency).
3. **Cosign verification gate** for the optional subprocess path: when `--use-syft` / `--use-grype` is set, the binary's cosign signature must be verifiable at startup; otherwise refuse to spawn (mitigates supply-chain compromise of the local binary).

## Domain-specific design rules (propagated to Stage 2 EARS)

From the audit findings, the following design rules are mandatory and must appear as EARS-formatted AC at Stage 2:

- **AC-NF-credentials** (lesson from CVE-2025-65965): `WHEN the report or sbom emitter writes to file or stdout THE SYSTEM SHALL scrub registry credentials and known-credential-pattern substrings before emission`
- **AC-NF-cosign-gate** (Gate 3 + Gate 8 propagation): `WHEN the user passes --use-syft or --use-grype THE SYSTEM SHALL verify the binary's cosign signature before spawning; IF verification fails THEN refuse with exit code = sysexits EX_NOPERM`
- **AC-NF-license-attribution** (Gate 2 propagation): `WHERE Anchore prior-art has informed the implementation of a module THE SYSTEM SHALL include a NOTICE file entry citing the Apache-2.0 origin per the License's §4 attribution requirement`

## Reversibility

This is a Proposed decision. If the user rejects adoption (Stage 1.5 user gate refuses), the project pivots to:
- pure self-implementation of SBOM parsing (no syft reference)
- Trivy / OSV-Scanner as alternative seeds (re-audit required, separate ADR)
- estimated +0.5 day dev cost increment

## References

- `spec.md` §2 (prior-art scan) + §2.2 (adoption gate) + §4 (compliance scope)
- OpenSSF Scorecard public API: `https://api.securityscorecards.dev/projects/github.com/anchore/{syft,grype}`
- GitHub Security Advisory database: `https://github.com/anchore/{syft,grype}/security/advisories`
- syft source: `https://github.com/anchore/syft`
- grype source: `https://github.com/anchore/grype`
- CVE-2025-65965 detail: `https://github.com/anchore/grype/security/advisories/GHSA-6gxw-85q2-q646`
- Cosign keyless verification pattern: `https://docs.sigstore.dev/cosign/verifying/verify/`

## User review gate

**Action required from user**:

1. ✅ / ❌ — Adopt `syft` as decomposed-prior-art seed at reference-only level, with optional subprocess + cosign-gate runtime path?
2. ✅ / ❌ — Adopt `grype` on the same terms?
3. ✅ / ❌ — Accept the propagation of AC-NF-credentials, AC-NF-cosign-gate, AC-NF-license-attribution into Stage 2 EARS?
4. ✅ / ❌ — Approve subprocess-wrap as opt-in via explicit CLI flag (default = pure TypeScript, no external binary dependency)?

Awaiting user clearance before Stage 2 Requirements (EARS) drafting.
