/**
 * Unit tests for the did-you-mean Levenshtein suggester (T-32).
 *
 * Spec mapping: AC-005-2, ADR-0006.
 */
import { describe, expect, it } from 'vitest';
import {
  didYouMean,
  formatDidYouMeanLine,
  levenshteinDistance,
} from '../../../src/cli/did-you-mean.js';

describe('levenshteinDistance', () => {
  it('identical strings → 0', () => {
    expect(levenshteinDistance('sbom', 'sbom')).toBe(0);
  });

  it('single insertion → 1', () => {
    expect(levenshteinDistance('sbom', 'sboms')).toBe(1);
  });

  it('single deletion → 1', () => {
    expect(levenshteinDistance('scans', 'scan')).toBe(1);
  });

  it('single substitution → 1', () => {
    expect(levenshteinDistance('scan', 'span')).toBe(1);
  });

  it('case-insensitive comparison', () => {
    expect(levenshteinDistance('SBOM', 'sbom')).toBe(0);
  });

  it('empty against non-empty equals length', () => {
    expect(levenshteinDistance('', 'sbom')).toBe(4);
    expect(levenshteinDistance('scan', '')).toBe(4);
  });

  it('two-edit distance', () => {
    expect(levenshteinDistance('scan', 'scon')).toBe(1);
    expect(levenshteinDistance('scan', 'sxan')).toBe(1);
  });
});

describe('didYouMean', () => {
  const subcommands = ['sbom', 'scan', 'report', 'suggest'];

  it('returns the single closest match with limit=1', () => {
    expect(didYouMean('scn', subcommands, { limit: 1 })).toEqual(['scan']);
  });

  it('returns multiple candidates ordered by distance', () => {
    const out = didYouMean('s', subcommands);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toBe('sbom'); // closest 3-edit candidate
  });

  it('returns empty array when no candidate is within threshold', () => {
    expect(didYouMean('xyzabc', subcommands)).toEqual([]);
  });

  it('honours custom maxDistance', () => {
    expect(didYouMean('s', subcommands, { maxDistance: 1 })).toEqual([]);
  });

  it('honours custom limit', () => {
    const out = didYouMean('s', subcommands, { maxDistance: 10, limit: 2 });
    expect(out).toHaveLength(2);
  });

  it('returns scan as the top match for "sccan"', () => {
    expect(didYouMean('sccan', subcommands)[0]).toBe('scan');
  });

  it('returns report as the top match for "reprt"', () => {
    expect(didYouMean('reprt', subcommands)[0]).toBe('report');
  });
});

describe('formatDidYouMeanLine', () => {
  const subcommands = ['sbom', 'scan', 'report', 'suggest'];

  it('returns the stderr-formatted suggestion line on a hit', () => {
    const out = formatDidYouMeanLine('scn', subcommands, { limit: 1 });
    expect(out).toBe('sbom-pilot: did you mean: scan?');
  });

  it('returns null when no candidate is close enough', () => {
    expect(formatDidYouMeanLine('xyzabc', subcommands)).toBeNull();
  });

  it('joins multiple candidates with comma + space', () => {
    const out = formatDidYouMeanLine('s', subcommands, { maxDistance: 10 });
    expect(out).toMatch(/^sbom-pilot: did you mean: .*,.*\?$/);
  });
});
