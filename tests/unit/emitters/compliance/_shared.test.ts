/**
 * Unit tests for the compliance shared scaffolding (T-22).
 *
 * Spec mapping: AC-003-5, ADR-0005, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNIPPET_MAX_AGE_MONTHS,
  formatComplianceFooter,
  isSnippetStale,
  listStaleSnippetWarnings,
  REGULATION_SNIPPETS,
  type RegulationId,
  type RegulationSnippet,
} from '../../../../src/emitters/compliance/_shared.js';

describe('REGULATION_SNIPPETS — registry exposes all 4 snippets', () => {
  it('contains entries for all four regulation ids', () => {
    const expected: RegulationId[] = ['appi-26-2', 'meti-sbom-v2', 'ntia', 'eu-cra'];
    for (const id of expected) {
      expect(REGULATION_SNIPPETS[id]).toBeDefined();
      expect(REGULATION_SNIPPETS[id].id).toBe(id);
    }
  });

  it('every snippet has a non-empty title / version / citation / retrievalDate', () => {
    for (const id of Object.keys(REGULATION_SNIPPETS) as RegulationId[]) {
      const s = REGULATION_SNIPPETS[id];
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.version.length).toBeGreaterThan(0);
      expect(s.citation.length).toBeGreaterThan(0);
      expect(s.retrievalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('isSnippetStale', () => {
  const mkSnippet = (retrievalDate: string): RegulationSnippet => ({
    id: 'ntia',
    title: 'test',
    version: 'v1',
    retrievalDate,
    citation: 'test citation',
  });

  it('returns false for a recently-retrieved snippet (<12 months)', () => {
    const s = mkSnippet('2026-04-01');
    const now = new Date('2026-05-20T00:00:00Z');
    expect(isSnippetStale(s, 12, now)).toBe(false);
  });

  it('returns true for a snippet retrieved > 12 months ago', () => {
    const s = mkSnippet('2024-01-01');
    const now = new Date('2026-05-20T00:00:00Z');
    expect(isSnippetStale(s, 12, now)).toBe(true);
  });

  it('honours a custom maxAgeMonths threshold', () => {
    const s = mkSnippet('2026-04-01');
    const now = new Date('2026-05-20T00:00:00Z');
    expect(isSnippetStale(s, 1, now)).toBe(true);
    expect(isSnippetStale(s, 2, now)).toBe(false);
  });

  it('returns true on unparseable retrievalDate (nag default)', () => {
    const s = mkSnippet('not-a-date');
    expect(isSnippetStale(s, 12, new Date('2026-05-20T00:00:00Z'))).toBe(true);
  });

  it('exposes a 12-month default per AC-003-5', () => {
    expect(DEFAULT_SNIPPET_MAX_AGE_MONTHS).toBe(12);
  });
});

describe('listStaleSnippetWarnings', () => {
  it('returns empty array when all snippets are fresh', () => {
    // All vendored snippets are retrieved 2026-05-20; pin `now` 1 day later.
    const warnings = listStaleSnippetWarnings(
      12,
      new Date('2026-05-21T00:00:00Z'),
    );
    expect(warnings).toEqual([]);
  });

  it('returns one warning per stale snippet', () => {
    // Pin `now` 5 years past the snippet retrievalDate — all should be stale.
    const warnings = listStaleSnippetWarnings(
      12,
      new Date('2031-05-21T00:00:00Z'),
    );
    expect(warnings).toHaveLength(4);
    for (const w of warnings) {
      expect(w).toContain('warning');
      expect(w).toContain('Refresh');
    }
  });
});

describe('formatComplianceFooter', () => {
  it('includes the citation + tool tag + retrieval date', () => {
    const footer = formatComplianceFooter('ntia', '0.1.0');
    expect(footer).toContain('NTIA');
    expect(footer).toContain('sbom-pilot-0.1.0');
    expect(footer).toContain('2026-05-20');
  });

  it('embeds the regulation citation verbatim for each regulation id', () => {
    for (const id of Object.keys(REGULATION_SNIPPETS) as RegulationId[]) {
      const footer = formatComplianceFooter(id, '0.1.0');
      expect(footer).toContain(REGULATION_SNIPPETS[id].citation);
    }
  });
});
