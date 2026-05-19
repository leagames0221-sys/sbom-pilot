# ADR-0007: Phase α exit gate — Writer/Reviewer pattern with 7-binary canonical rubric

**Status**: Accepted
**Date**: 2026-05-19
**Stage**: 3 (Design)

## Context

Stage 1 §7 + §9 Q4 locked: Phase α exit criteria = 7-binary full apply from the canonical rubric. Stage 2 §10.6 verified 7/7 criteria have AC backing. This ADR specifies the verification protocol — *how* the criteria are evaluated, *who* evaluates, *what counts as evidence*, and *what the user gate looks like*.

The protocol must be drift-resistant: AI-driven verification has documented failure modes (pattern labeling, top-rank self-claims without literal verification, criteria invention outside the rubric). The canonical rubric explicitly forbids AI self-promotion; rank elevation requires user explicit OK.

## Decision

### 7 binary criteria (literal from canonical rubric)

| # | Criterion | Verification path for `sbom-pilot` |
| --- | --- | --- |
| 1 | Working code + tests + CI green | vitest spec count ≥ 500, line-coverage ≥ 90%, 3-OS CI conclusion=success on the verify commit |
| 2 | Quality README documentation | structured README (problem + architecture + setup + tests + license + ≥ 10 sections); 30-sec pitch in first paragraph; architecture diagram + tech-stack rationale; LICENSE / SECURITY links |
| 3 | Original work, not forked / tutorial | majority commits = original code (no fork heritage in `git log`, no copied tutorial repo as the seed); syft/grype = reference-only per ADR-0001, no vendored code |
| 4 | Recent + consistent activity | last commit < 30 days from verify date; ≥ 30 commits in first 30 days |
| 5 | Technical breadth + depth with rationale | ≥ 6 ADRs (0001-0007 satisfy this); per-layer tech-stack rationale in README + ADR-0002 |
| 6 | Domain knowledge / real problem solved | 4-regulation compliance reports (AC-003-1..4) literal implemented; SBOM-tooling domain depth visible in code (pURL handling, license expression parsing, OSV.dev schema handling) |
| 7 | Security + honest framing + AI-era awareness | paid-API 6-layer defense (AC-NF-1..6); supply-chain hygiene (lockfile + audit-gate + Dependabot); offline-first; cosign gate on subprocess (AC-NF-cosign-gate); honest "Phase α PoC; contract / sandbox for production" framing in README |

### Writer / Reviewer protocol

The verify cycle is the canonical Writer/Reviewer pattern:

1. **Writer** (the implementing session): on completing Phase 1 tasks, the writer prepares a verify-report drafting the per-criterion evidence list (file paths, commit hashes, CI run IDs).
2. **Reviewer** (independent fresh-context subagent invocation): receives only the rubric path + target paths + claimed verdict (top-rank). The reviewer does NOT receive the writer's reasoning. The reviewer reads the rubric literally, walks the target paths, and returns PASS/FAIL/UNCERTAIN per criterion.
3. **Reconciliation**: if reviewer returns CONFIRM (7/7 PASS), the verdict goes to the user gate. If REFUTE (any FAIL), the writer fixes the failing criterion and re-runs. Up to N rounds (no fixed cap; convergence-driven).
4. **User gate**: even at reviewer CONFIRM, the AI does NOT self-promote. The reviewer's report is surfaced to the user; only the user's explicit OK promotes the project to the top rank.

### Forbidden patterns (literal, from rubric §axis-invent + §user-gate)

- AI inventing new criteria outside the 7 listed (rubric SSoT is unique)
- "Marginal PASS" / "approximately verified" / "rank-adjacent" softer framing
- Rank elevation by AI self-judgment without user gate
- Pattern-label assertions ("looks complete", "structure looks right") instead of literal evidence
- Trusting MEMORY-style markers ("verified" entries in side files) without re-verification

### Evidence cite format (mandatory)

Each criterion's evidence must cite:

- File path + line number (`src/cli/sbom.ts:42`) OR
- Command + output snippet (`pnpm test → 506 passed`) OR
- Commit hash + summary (`commit ad63b4d: Stage 2 EARS`) OR
- CI run URL (`gh run 12345678901: conclusion=success`)

"No evidence found" → mark UNCERTAIN, do not PASS.

## Rationale

### Why this protocol, not "AI says it's done"

Documented drift modes include the writer emitting "verified" verdicts via pattern labels (the README looks comprehensive, so it's comprehensive). The Writer/Reviewer split with fresh context is the proven mitigation — the reviewer cannot inherit the writer's optimism because the reviewer never sees the writer's reasoning.

### Why user gate even at reviewer CONFIRM

Even two AI passes can share systemic drift (they run the same base model). The user gate is the final layer of independent review — a human who can override an AI consensus when warranted. The canonical rubric encodes this as a structural rule.

### Why 7 binary, not weighted score

- Inter-rater reliability: binary is reproducible; weighted scores depend on subjective weights
- No "almost top-rank" loophole
- Each criterion is a hard gate, no compensating excellence on one criterion for failure on another

## Alternatives considered

### Single-AI self-verify (rejected)

- **Pros**: faster
- **Cons**: documented drift mode; not survivable for portfolio claims
- **Why rejected**: literal failure mode

### External code review service (rejected for Phase α)

- **Pros**: independent human eyes
- **Cons**: cost (paid services have CC requirement, violates project constraint); time
- **Why rejected**: Free + no-CC constraint; reviewer subagent + user gate is sufficient

### Continuous scorecard tracking (rejected as exit gate)

- **Pros**: provides ongoing signal
- **Cons**: not a binary gate; useful as monitoring, not exit criterion
- **Why rejected for exit gate role**: lacks pass/fail clarity (but will be wired as a CI signal anyway via `scorecard.yml` workflow)

## Tradeoffs accepted

| Tradeoff | Mitigation |
| --- | --- |
| Reviewer cost = 1 subagent invocation per verify round | acceptable, fresh-context invocation is cheap |
| Multiple round-trips if writer drifts repeatedly | drift is the diagnostic; root-cause fix before re-attempt |
| User gate delay | mandatory by rubric; user can cap by setting a deadline |

## Phase α exit checklist (literal, must all be ✅ for PUBLIC flip judgment)

- [ ] All 38 AC from spec.md §10 have an implemented + tested counterpart
- [ ] vitest spec count ≥ 500, line-coverage ≥ 90%
- [ ] 3-OS CI matrix conclusion=success on the verify commit
- [ ] pnpm audit --audit-level=high = clean
- [ ] gitleaks scan = clean
- [ ] No internal-infrastructure-name leaks in any committed file (channel B mask pre-commit clean)
- [ ] Writer/Reviewer verify round CONFIRM 7/7 PASS
- [ ] User explicit OK for top-rank promotion
- [ ] README + LICENSE + SECURITY + NOTICE finalized
- [ ] portfolio HTML + intro email template updated to include sbom-pilot row

## References

- `spec.md` §7 (Phase α exit criteria sketch) + §10.6 (coverage matrix) + §10.7 (EARS approve gate)
- canonical rank rubric (referenced as the SSoT for the 7-binary list)
- Anthropic 公式 Writer/Reviewer pattern: `https://code.claude.com/docs/en/best-practices`
- prior session lessons on drift modes (writer pattern-labeling)
