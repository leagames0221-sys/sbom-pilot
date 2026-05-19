# ADR-0005: SBOM format support matrix — internal IR + dual emitter

**Status**: Accepted
**Date**: 2026-05-19
**Stage**: 3 (Design)

## Context

Stage 2 §10.1 mandates SBOM emission in two formats: SPDX 2.3 (default) and CycloneDX 1.5 (selectable via `--format cyclonedx`). The two formats overlap conceptually but differ in JSON shape, field naming, identifier semantics, and license-expression conventions.

A naïve approach: two independent emitters, each walking the project dependency tree from scratch. This duplicates parser-side logic and tightly couples each emitter to dependency-tree internals.

The chosen approach: an internal intermediate representation (IR) populated once from the project, then projected by per-format emitters.

## Decision

### Internal IR (intermediate representation)

```ts
// src/ir/sbom-ir.ts
interface SbomIR {
  document: {
    namespace: string;        // deterministic URN from project + git HEAD
    createdAt: string;        // ISO8601
    creator: 'sbom-pilot';
    creatorVersion: string;
    rootComponent: ComponentRef;
  };
  components: Component[];    // flat list, ID-referenced from relationships
  relationships: Relationship[];
}

interface Component {
  id: string;                 // local unique ID
  purl: string;               // package URL per pURL spec
  name: string;
  version: string;
  supplier?: string;
  license?: LicenseExpression;
  hash?: { algorithm: 'SHA-256' | 'SHA-512'; value: string };
  ecosystem: 'npm' | 'PyPI' | 'Go' | 'Maven' | 'crates.io' | 'unknown';
}

interface Relationship {
  from: string;               // Component.id
  to: string;                 // Component.id
  type: 'depends-on' | 'dev-depends-on' | 'optional-depends-on';
}

interface LicenseExpression {
  spdxId?: string;            // canonical SPDX License ID
  name?: string;              // raw, when spdxId not resolvable
  expression?: string;        // SPDX license expression (e.g. "MIT OR Apache-2.0")
}
```

The IR contains exactly the union of fields needed by both SPDX 2.3 and CycloneDX 1.5 minimum-element sets, plus the extra fields required by ADR-0003 compliance reports (NTIA 7 mandatory + METI minimum field set).

### Emitters

```
src/emitters/
  spdx-2.3.ts          # SbomIR → SPDX 2.3 JSON
  cyclonedx-1.5.ts     # SbomIR → CycloneDX 1.5 JSON
  sarif-2.1.0.ts       # findings → SARIF (re-used pattern, not SBOM)
  compliance/
    appi-26-2.ts       # SbomIR + findings → 日本語 incident report
    meti-sbom-v2.ts    # SbomIR → 日本語 minimum-field validator
    ntia.ts            # SbomIR → English NTIA summary
    eu-cra.ts          # SbomIR + findings → English CRA checklist
  _shared.ts           # atomic write, citation footer, severity section
```

Each emitter is a pure function `(ir: SbomIR) => string | Uint8Array`, validated against its schema before write.

## Rationale

### Why an IR, not direct emit-per-parser

1. **DRY**: parser logic walks the dependency tree once; both emitters consume the same IR. No 2× tree-walk bugs.
2. **Round-trip**: future feature — read an existing SPDX file, produce CycloneDX (or vice versa) — becomes possible by adding parser-side IR loaders.
3. **Compliance reports reuse**: AC-003-1..8 reports also consume the IR, not the emitted SBOM. No SBOM-format-coupling in the compliance layer.
4. **Test simplification**: assert against the IR (structural), then snapshot-test the emitter projection separately.

### Why this specific IR shape

- **Flat components + relationship edges**: matches both SPDX (`SPDXID` references) and CycloneDX (`bom-ref` references) cleanly. Tree-shaped IR would force flattening at every emit.
- **pURL as canonical identifier**: industry standard, unambiguous, both formats support it.
- **SPDX License ID first-class**: most projects use simple SPDX IDs; the `expression` escape handles complex cases (`MIT OR Apache-2.0`).
- **`hash` optional**: not every dependency manifest provides hashes; setting it to optional avoids fake/synthesized hashes that would mislead downstream auditors.

### Why minimum-field-only IR, not maximalist superset

YAGNI: every IR field not driven by an AC is a maintenance cost. Phase α IR contains exactly what 8 emitters need. Future enrichment (build-time provenance, attestations, vulnerability-finding embedding) is additive (extend the IR, ship a new emitter version).

## Alternatives considered

### Two independent emitters, no IR (rejected)

- **Pros**: less abstraction, faster initial implementation
- **Cons**: duplicate parser walk, divergent bugs, no round-trip path, compliance reports tightly coupled to one format
- **Why rejected**: long-term debt + duplicates ADR-0003's per-standard split anti-pattern

### CycloneDX library's `Bom` object as IR (rejected)

- **Pros**: pre-built type definitions
- **Cons**: locks IR to CycloneDX semantics (SPDX projection becomes second-class), library version churn drags IR shape, license attribution risk
- **Why rejected**: vendor-shape bias defeats neutrality

### SPDX `Document` object as IR (rejected)

- Same issue as CycloneDX, mirror image (CycloneDX projection becomes second-class)

## Tradeoffs accepted

| Tradeoff | Mitigation |
| --- | --- |
| Extra abstraction layer (IR) | minimal IR (8 fields per component, 3 per relationship); zod schema enforces shape |
| Field-mapping bugs between IR and format | golden-file tests per format with canonical fixture inputs |

## Reversibility

If the IR proves leaky (i.e. a future emitter needs fields the IR doesn't carry), the fix is additive: extend the IR, version-bump it via the `manifest.version` field. The cost is bounded.

If the entire abstraction proves unnecessary (e.g. only one format ever ships), removing the IR is a mechanical refactor — but this is unlikely given the locked dual-format requirement.

## References

- `spec.md` §10.1 (F-001 AC list)
- pURL spec: `https://github.com/package-url/purl-spec`
- SPDX 2.3 spec: `https://spdx.github.io/spdx-spec/v2.3/`
- CycloneDX 1.5 spec: `https://cyclonedx.org/docs/1.5/json/`
- SPDX License List: `https://spdx.org/licenses/`
