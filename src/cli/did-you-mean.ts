/**
 * Did-you-mean suggester for unknown CLI subcommands (AC-005-2).
 *
 * Computes Levenshtein distance from the user's input against every
 * registered subcommand name and returns the candidates within a
 * tunable distance threshold, ordered by ascending distance + then
 * by lexical name.
 *
 * Per ADR-0006 §Decision: Layer 5 (CLI) helper. No dependencies on
 * the layers below it; only consumed by `src/cli/index.ts`.
 *
 * Spec mapping: AC-005-2, ADR-0006.
 */

/**
 * Classic dynamic-programming Levenshtein distance. O(n·m) time + space.
 * Optimised constants — the inputs are short command names (< 20 chars)
 * so the full DP matrix is fine; no need for the rolling-row variant.
 *
 * Case-insensitive: both inputs are lowercased before comparison.
 */
export function levenshteinDistance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const m = x.length;
  const n = y.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = x.charCodeAt(i - 1) === y.charCodeAt(j - 1) ? 0 : 1;
      const del = dp[i - 1]![j]! + 1;
      const ins = dp[i]![j - 1]! + 1;
      const sub = dp[i - 1]![j - 1]! + cost;
      dp[i]![j] = Math.min(del, ins, sub);
    }
  }
  return dp[m]![n]!;
}

export interface DidYouMeanOptions {
  /** Maximum edit distance for a candidate to be suggested. Default 3. */
  maxDistance?: number;
  /** Maximum number of candidates returned. Default 3. */
  limit?: number;
}

/**
 * Return up to `limit` subcommand names sorted by ascending edit
 * distance from `input`, filtered by `maxDistance`. Ties broken
 * lexicographically.
 */
export function didYouMean(
  input: string,
  candidates: ReadonlyArray<string>,
  options: DidYouMeanOptions = {},
): string[] {
  const maxDistance = options.maxDistance ?? 3;
  const limit = options.limit ?? 3;
  const scored = candidates
    .map((c) => ({ name: c, distance: levenshteinDistance(input, c) }))
    .filter((c) => c.distance <= maxDistance)
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  return scored.slice(0, limit).map((c) => c.name);
}

/**
 * Format the suggester output as a single stderr line. Returns null
 * when no candidate is close enough to suggest.
 */
export function formatDidYouMeanLine(
  input: string,
  candidates: ReadonlyArray<string>,
  options: DidYouMeanOptions = {},
): string | null {
  const matches = didYouMean(input, candidates, options);
  if (matches.length === 0) return null;
  return `sbom-pilot: did you mean: ${matches.join(', ')}?`;
}
