/**
 * dependency-cruiser config — enforces ADR-0006 one-way dependency
 * direction across the 5 layers (Parsers → IR ← Scanners ← Emitters ← CLI).
 *
 * Each forbidden rule below mirrors one of ADR-0006 §"Forbidden
 * dependency edges (literal)":
 *
 *   1. Parsers → Emitters (parsers cannot know about output formats)
 *   2. Scanners → Parsers (scanners receive an IR, not raw manifests)
 *   3. IR → anything inside src/ (IR is leaf data)
 *   4. Emitters → Scanners (emitters serialize, do not scan)
 *   5. Anything → CLI (CLI is the top, nothing else imports from it)
 *
 * Run locally: `pnpm run lint:deps`
 * CI gate: wired into ci.yml at T-33's next iteration if green here.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-parsers-to-emitters',
      severity: 'error',
      comment:
        'ADR-0006 edge 1: Parsers must not import from Emitters. ' +
        'Parsers produce IR; they cannot know about SPDX/CycloneDX/SARIF/compliance output formats.',
      from: { path: '^src/parsers/' },
      to: { path: '^src/emitters/' },
    },
    {
      name: 'no-scanners-to-parsers',
      severity: 'error',
      comment:
        'ADR-0006 edge 2: Scanners must not import from Parsers. ' +
        'Scanners receive an already-built IR; they have no awareness of raw manifests.',
      from: { path: '^src/scanners/' },
      to: { path: '^src/parsers/' },
    },
    {
      name: 'no-ir-to-anything',
      severity: 'error',
      comment:
        'ADR-0006 edge 3: IR is leaf data. It must not import from any other internal layer. ' +
        'External imports (zod) are allowed via the path-not pattern below.',
      from: { path: '^src/ir/' },
      to: {
        path: '^src/',
        pathNot: '^src/ir/',
      },
    },
    {
      name: 'no-emitters-to-scanners',
      severity: 'error',
      comment:
        'ADR-0006 edge 4: Emitters serialize IR; they must not scan. ' +
        'Scan results are passed in as parameters, not imported.',
      from: { path: '^src/emitters/' },
      to: { path: '^src/scanners/' },
    },
    {
      name: 'no-anything-to-cli',
      severity: 'error',
      comment:
        'ADR-0006 edge 5: CLI sits at the top of the import graph. ' +
        'Nothing else (src/parsers, src/ir, src/scanners, src/emitters, src/providers, src/util) may import from it.',
      from: {
        path: '^src/',
        pathNot: '^src/cli/',
      },
      to: { path: '^src/cli/' },
    },
    // Hygienic guards beyond ADR-0006:
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular imports defeat the one-way dependency contract from ADR-0006.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'Orphan modules (no incoming imports + not entry-points) suggest dead code under src/. Entry points (bin / scripts / tests / config files / type-only barrels) are excluded via individual path-anchored patterns below; dependency-cruiser flags alternation regexes as unsafe so we list each path prefix as a separate literal anchor.',
      from: {
        orphan: true,
        pathNot: [
          '^bin/',
          '^scripts/',
          '^tests/',
          '^docs/',
          'vitest\\.config\\.ts$',
          '\\.dependency-cruiser\\.cjs$',
          '\\.d\\.ts$',
          '/types\\.ts$',
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
