/**
 * Citation snippet for the EU Cyber Resilience Act (Regulation (EU)
 * 2024/2847), Annex I "Essential cybersecurity requirements". Embedded
 * in the footer of every EU CRA report (T-26).
 *
 * Source: Regulation (EU) 2024/2847 of the European Parliament and of
 *         the Council of 23 October 2024 on horizontal cybersecurity
 *         requirements for products with digital elements,
 *         (https://eur-lex.europa.eu/eli/reg/2024/2847)
 */
export const EU_CRA_SNIPPET = {
  id: 'eu-cra',
  title: 'EU Cyber Resilience Act (Regulation (EU) 2024/2847) Annex I',
  version: '2024-10-23',
  retrievalDate: '2026-05-20',
  citation:
    'Regulation (EU) 2024/2847 of the European Parliament and of the Council of 23 October 2024, Annex I — Essential cybersecurity requirements, https://eur-lex.europa.eu/eli/reg/2024/2847',
} as const;

/**
 * Annex I Part 1 checklist items used by the T-26 emitter. These map
 * to the high-level cybersecurity properties Annex I §1 requires from
 * "products with digital elements" — each becomes a row in the
 * CRA-checklist report table.
 */
export const EU_CRA_ANNEX_I_PART_1_ITEMS = [
  'Designed, developed and produced to ensure an appropriate level of cybersecurity (Art. 13(1))',
  'Delivered without known exploitable vulnerabilities (Annex I §1(2)(a))',
  'Secure-by-default configuration (Annex I §1(2)(b))',
  'Vulnerability handling process is documented (Art. 13(8) + Annex I §2(1))',
  'SBOM of top-level dependencies is documented (Annex I §2(1))',
  'Security updates available without charge (Annex I §1(2)(k))',
  'Confidentiality + integrity of data (Annex I §1(2)(e) / (f))',
] as const;
