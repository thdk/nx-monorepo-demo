import type { EvalSet } from '../types.js';

export interface EvalSelection {
  /** A new EvalSet containing only the matching items, preserving original order. */
  evalSet: EvalSet;
  /** 0-based positions in the input evalSet.evals for each kept item, sorted ascending. */
  originalIndices: number[];
  /** Filter values that matched no eval, for use in warnings. */
  unmatchedFilters: string[];
}

/**
 * Picks the subset of evals matching one or more --filter values.
 *
 * Filter semantics (mirrors what the live table displays so users can copy what
 * they see):
 *   - A purely numeric value matches `item.id`, falling back to the 1-based
 *     position when the item has no `id`.
 *   - Any other value matches `item.name` exactly (case-insensitive).
 *
 * Repeated and/or comma-separated values are flattened, trimmed, and de-duped.
 * Each input filter token is reported in `unmatchedFilters` if it matched
 * nothing; callers decide whether to warn, error, or both. An empty filter
 * list is a no-op that returns the input evalSet unchanged.
 */
export function selectEvals(
  evalSet: EvalSet,
  filters: readonly string[]
): EvalSelection {
  const tokens = filters
    .flatMap((f) => f.split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (tokens.length === 0) {
    return {
      evalSet,
      originalIndices: evalSet.evals.map((_unused, i) => i),
      unmatchedFilters: [],
    };
  }

  const matched = new Set<number>();
  const unmatchedFilters: string[] = [];

  for (const token of tokens) {
    const hits = matchToken(evalSet, token);
    if (hits.length === 0) {
      unmatchedFilters.push(token);
    } else {
      for (const idx of hits) matched.add(idx);
    }
  }

  const originalIndices = [...matched].sort((a, b) => a - b);
  return {
    evalSet: {
      ...evalSet,
      evals: originalIndices.map((i) => {
        const item = evalSet.evals[i];
        if (!item) throw new Error(`internal: missing eval at index ${i}`);
        return item;
      }),
    },
    originalIndices,
    unmatchedFilters,
  };
}

function matchToken(evalSet: EvalSet, token: string): number[] {
  const matches: number[] = [];
  // /^\d+$/ — not Number(token), because Number('') === 0 and Number(' 1') === 1.
  // We want only digit-only tokens to take the numeric branch so names like ""
  // or " 42" don't get reinterpreted.
  if (/^\d+$/.test(token)) {
    const wanted = Number(token);
    evalSet.evals.forEach((item, idx) => {
      const displayId = item.id ?? idx + 1;
      if (displayId === wanted) matches.push(idx);
    });
    return matches;
  }
  const lower = token.toLowerCase();
  evalSet.evals.forEach((item, idx) => {
    if (item.name && item.name.toLowerCase() === lower) matches.push(idx);
  });
  return matches;
}
