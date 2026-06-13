import { describe, expect, it } from 'vitest';

import type { EvalSet } from '../types.js';

import { selectEvals } from './select-evals.js';

function makeSet(items: EvalSet['evals']): EvalSet {
  return { skill_name: 'fake', evals: items };
}

describe('selectEvals', () => {
  it('returns the input set unchanged when no filters are provided', () => {
    const set = makeSet([
      { query: 'a', should_trigger: true },
      { query: 'b', should_trigger: false },
    ]);
    const result = selectEvals(set, []);
    expect(result.evalSet).toBe(set);
    expect(result.originalIndices).toEqual([0, 1]);
    expect(result.unmatchedFilters).toEqual([]);
  });

  it('matches numeric values against item.id when set', () => {
    const set = makeSet([
      { id: 10, query: 'a', should_trigger: true },
      { id: 20, query: 'b', should_trigger: true },
      { id: 30, query: 'c', should_trigger: true },
    ]);
    const result = selectEvals(set, ['20']);
    expect(result.evalSet.evals).toHaveLength(1);
    expect(result.evalSet.evals[0]?.query).toBe('b');
    expect(result.originalIndices).toEqual([1]);
  });

  it('falls back to 1-based position when item.id is absent', () => {
    const set = makeSet([
      { query: 'a', should_trigger: true },
      { query: 'b', should_trigger: true },
      { query: 'c', should_trigger: true },
    ]);
    const result = selectEvals(set, ['2']);
    expect(result.evalSet.evals).toHaveLength(1);
    expect(result.evalSet.evals[0]?.query).toBe('b');
    expect(result.originalIndices).toEqual([1]);
  });

  it('matches names case-insensitively', () => {
    const set = makeSet([
      { id: 1, name: 'flat-route', query: 'a', should_trigger: true },
      { id: 2, name: 'nested-route', query: 'b', should_trigger: true },
    ]);
    const result = selectEvals(set, ['FLAT-ROUTE']);
    expect(result.evalSet.evals).toHaveLength(1);
    expect(result.evalSet.evals[0]?.name).toBe('flat-route');
  });

  it('flattens comma-separated values and de-duplicates matches', () => {
    const set = makeSet([
      { id: 1, name: 'one', query: 'a', should_trigger: true },
      { id: 2, name: 'two', query: 'b', should_trigger: true },
      { id: 3, name: 'three', query: 'c', should_trigger: true },
    ]);
    // `1` and `one` both target the same eval — de-dupe.
    const result = selectEvals(set, ['1,three', 'one']);
    expect(result.evalSet.evals.map((e) => e.name)).toEqual(['one', 'three']);
    expect(result.originalIndices).toEqual([0, 2]);
  });

  it('combines repeated flags additively', () => {
    const set = makeSet([
      { id: 1, query: 'a', should_trigger: true },
      { id: 2, query: 'b', should_trigger: true },
      { id: 3, query: 'c', should_trigger: true },
    ]);
    const result = selectEvals(set, ['1', '3']);
    expect(result.originalIndices).toEqual([0, 2]);
  });

  it('reports unmatched filters without erroring', () => {
    const set = makeSet([
      { id: 1, name: 'one', query: 'a', should_trigger: true },
    ]);
    const result = selectEvals(set, ['one', 'does-not-exist', '99']);
    expect(result.originalIndices).toEqual([0]);
    expect(result.unmatchedFilters).toEqual(['does-not-exist', '99']);
  });

  it('returns an empty selection when no filter matches anything', () => {
    const set = makeSet([
      { id: 1, name: 'one', query: 'a', should_trigger: true },
    ]);
    const result = selectEvals(set, ['nope']);
    expect(result.evalSet.evals).toEqual([]);
    expect(result.originalIndices).toEqual([]);
    expect(result.unmatchedFilters).toEqual(['nope']);
  });

  it('preserves original order regardless of filter input order', () => {
    const set = makeSet([
      { id: 1, query: 'a', should_trigger: true },
      { id: 2, query: 'b', should_trigger: true },
      { id: 3, query: 'c', should_trigger: true },
    ]);
    const result = selectEvals(set, ['3', '1']);
    expect(result.evalSet.evals.map((e) => e.query)).toEqual(['a', 'c']);
    expect(result.originalIndices).toEqual([0, 2]);
  });

  it('ignores empty tokens from stray commas or whitespace', () => {
    const set = makeSet([
      { id: 1, query: 'a', should_trigger: true },
      { id: 2, query: 'b', should_trigger: true },
    ]);
    const result = selectEvals(set, [' 1 , , ', '']);
    expect(result.originalIndices).toEqual([0]);
    expect(result.unmatchedFilters).toEqual([]);
  });
});
