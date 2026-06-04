import { describe, expect, it } from 'vitest';

import type { OutputEvalRun } from '../types.js';

import { aggregateRuns, calculateStats, computeDelta } from './aggregate.js';

function fakeRun(
  configuration: 'with_skill' | 'without_skill',
  passRate: number,
  durationMs: number,
  totalTokens: number,
): OutputEvalRun {
  return {
    eval_id: 1,
    eval_name: 'test',
    query: 'q',
    configuration,
    run_number: 1,
    execution: {
      final_text: 'x',
      tool_uses: [],
      output_files: [],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: totalTokens },
      duration_ms: durationMs,
      ok: true,
    },
    grading: {
      expectations: [],
      summary: { passed: 0, failed: 0, total: 0, pass_rate: passRate },
    },
  };
}

describe('calculateStats', () => {
  it('returns zero stats for empty input', () => {
    expect(calculateStats([])).toEqual({ mean: 0, stddev: 0, min: 0, max: 0 });
  });

  it('computes mean and zero stddev for a single value', () => {
    expect(calculateStats([42])).toEqual({ mean: 42, stddev: 0, min: 42, max: 42 });
  });

  it('computes sample stddev (n-1) for multiple values', () => {
    const stats = calculateStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats.mean).toBe(5);
    expect(stats.stddev).toBeCloseTo(2.138, 2);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(9);
  });
});

describe('aggregateRuns', () => {
  it('groups runs by configuration and aggregates stats per group', () => {
    const runs = [
      fakeRun('with_skill', 1.0, 30_000, 4000),
      fakeRun('with_skill', 0.8, 40_000, 5000),
      fakeRun('without_skill', 0.4, 20_000, 2500),
    ];
    const stats = aggregateRuns(runs);
    expect(stats['with_skill']?.pass_rate.mean).toBe(0.9);
    expect(stats['with_skill']?.time_seconds.mean).toBe(35);
    expect(stats['without_skill']?.pass_rate.mean).toBe(0.4);
  });
});

describe('computeDelta', () => {
  it('returns undefined when only one configuration is present', () => {
    const stats = aggregateRuns([fakeRun('with_skill', 1, 30_000, 4000)]);
    expect(computeDelta(stats)).toBeUndefined();
  });

  it('computes signed deltas with + prefix for positive values', () => {
    const stats = aggregateRuns([
      fakeRun('with_skill', 0.9, 35_000, 4500),
      fakeRun('without_skill', 0.4, 20_000, 2500),
    ]);
    const delta = computeDelta(stats);
    expect(delta?.pass_rate).toBe('+0.50');
    expect(delta?.time_seconds).toBe('+15.0');
    expect(delta?.tokens).toBe('+2000');
  });
});
