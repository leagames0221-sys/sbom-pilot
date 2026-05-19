/**
 * Citation snippet for NTIA's "The Minimum Elements For a Software Bill
 * of Materials (SBOM)" (July 2021 publication, directed by Executive
 * Order 14028). Embedded in the footer of every NTIA report (T-25).
 *
 * Source: U.S. Department of Commerce, NTIA, "The Minimum Elements For
 *         a Software Bill of Materials (SBOM)", July 12 2021
 *         (https://www.ntia.gov/SBOM)
 */
export const NTIA_SNIPPET = {
  id: 'ntia',
  title: 'NTIA Minimum Elements for a Software Bill of Materials (SBOM)',
  version: 'July 2021',
  retrievalDate: '2026-05-20',
  citation:
    'NTIA, "The Minimum Elements For a Software Bill of Materials (SBOM)", July 12 2021, https://www.ntia.gov/SBOM',
} as const;

/**
 * The seven NTIA-mandated minimum SBOM elements per the published
 * spec, in the order they appear in the report tables. Used by the
 * T-25 emitter to drive the PASS/FAIL column generation.
 */
export const NTIA_MINIMUM_ELEMENTS = [
  'Supplier Name',
  'Component Name',
  'Version of the Component',
  'Other Unique Identifiers',
  'Dependency Relationship',
  'Author of SBOM Data',
  'Timestamp',
] as const;
