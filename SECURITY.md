# Security policy — sbom-pilot

`sbom-pilot` is a defensive-first CLI for generating Software Bill of Materials
(SBOM), scanning dependencies for known vulnerabilities, and producing
compliance-aligned reports (改正個情法 / METI SBOM 導入手引き / NTIA Minimum
Elements / EU CRA). We take the security posture of this tool seriously
precisely because it is itself a security tool.

## Supported versions

Until the first 1.0 release, security fixes ship against `main` only.
Pre-1.0 minor versions are not maintained as separate branches.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| 0.x.x   | :white_check_mark: (fixes land on `main` only) |

## Reporting a vulnerability

If you believe you have found a security vulnerability in `sbom-pilot`, please
**do not file a public GitHub issue**. Instead, use one of the channels below.

### Preferred: GitHub Security Advisories

Open a private security advisory at
<https://github.com/leagames0221-sys/sbom-pilot/security/advisories/new>.
This routes the report to the maintainer privately and tracks remediation in
GitHub's coordinated-disclosure workflow.

### Alternative: email

Send a report to the GitHub-noreply address associated with the
`leagames0221-sys` account, or open a placeholder issue tagged
`security-contact-please` (without details) and the maintainer will respond
with a private channel.

### What to include

- Affected version (commit SHA or release tag)
- Reproduction steps or proof-of-concept
- Expected vs. observed behavior
- Suggested remediation (optional)

### Service-level expectations

- **Acknowledgment**: within 5 business days of report
- **Initial triage**: within 10 business days (severity + remediation plan)
- **Fix landing**: severity-dependent — high/critical aim for 30 days,
  moderate aim for 60 days, low best-effort

These are aspirational; this project is maintained on a personal-time basis
and the SLA is not contractual.

## Scope

In scope (final boundaries locked at Stage 3 Design, see `spec.md`):

- The `sbom-pilot` CLI itself
- SBOM generator (parser + emitter for SPDX 2.3 / CycloneDX 1.5)
- Vulnerability scanner (OSV / NVD / GHSA correlation)
- Compliance reporter (改正個情法 / METI SBOM / NTIA / EU CRA mappings)
- Configuration loading and credential-handling paths
- LLM provider clients (remediation suggestions, env-var-gated optional)
- The published package supply chain (build outputs)

Out of scope:

- Vulnerabilities in upstream dependencies (syft / grype / OSV-Scanner if
  vendored) that are tracked separately upstream
- Misuse of the tool to scan systems you do not own (defensive use only)
- False positives or coverage gaps in upstream vulnerability databases
  (OSV / NVD / GHSA) — please report to the relevant database

## Hardening posture

`sbom-pilot` follows several supply-chain and runtime-hardening conventions
(stack-final list locked at Stage 1 Discovery, see `spec.md`):

- **Pinned dependencies**: lockfile committed, refreshed only via the
  dependency-review CI gate
- **No paid-API auto-call**: paid LLM provider clients refuse to construct
  unless both an API key env var AND `SBOM_PILOT_LLM_PROVIDER=<provider>` are
  set explicitly
- **No credential-file reads**: the CLI does not read from `.env` or other
  credential paths in the current working directory by default
- **Localhost-only LLM by default**: when LLM enrichment is enabled, default
  provider talks only to `localhost:11434` (Ollama) and never forwards
  prompts to remote endpoints implicitly
- **Output sanitization**: ANSI escape sequences and control chars are
  stripped from user-supplied content before terminal emission
- **Atomic file emission**: report writers use temp+rename to avoid partial-
  write corruption under concurrent execution
- **Build-script denial by default**: post-install scripts blocked unless
  explicitly approved per package
- **Supply-chain audit floor**: CI fails on high-severity advisory hits
- **Offline-first mode**: SBOM generation works against cached vulnerability
  database snapshots; network egress is opt-in for fresh fetches

## Coordinated disclosure

If you report a vulnerability and we coordinate a fix, we will credit you in
the release notes unless you ask otherwise. Embargo windows are negotiated
case-by-case.

## License

This project and its security policy are licensed under MIT.
