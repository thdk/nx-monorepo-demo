import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunOutcome } from '../types.js';

import type { RunQueryOptions, RunQueryResult } from './run-query.js';
import { runSet } from './run-set.js';

function makeSkill(tmpRoot: string): string {
  const dir = mkdtempSync(join(tmpRoot, 'skill-'));
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---
name: fake-skill
description: a fake skill for testing
---

body
`
  );
  return dir;
}

interface Scripted {
  outcome: RunOutcome;
  error?: string;
  durationMs?: number;
}

function scriptedRunQuery(plan: Record<string, Scripted[]>) {
  const cursors: Record<string, number> = {};
  return async (options: RunQueryOptions): Promise<RunQueryResult> => {
    const list = plan[options.query] ?? [];
    const i = cursors[options.query] ?? 0;
    cursors[options.query] = i + 1;
    const step = list[i] ?? { outcome: 'miss' };
    return {
      outcome: step.outcome,
      triggerId: 'fake-trigger',
      durationMs: step.durationMs ?? 100,
      ...(step.error ? { error: step.error } : {}),
    };
  };
}

describe('runSet', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'skill-eval-set-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('aggregates triggers/misses/errors per query and computes pass/fail', async () => {
    const skill = makeSkill(tmp);
    const out = await runSet({
      evalSet: {
        skill_name: 'fake-skill',
        evals: [
          { query: 'positive', should_trigger: true },
          { query: 'negative', should_trigger: false },
        ],
      },
      skillPath: skill,
      runsPerQuery: 3,
      concurrency: 2,
      triggerThreshold: 0.5,
      runQuery: scriptedRunQuery({
        positive: [
          { outcome: 'trigger' },
          { outcome: 'trigger' },
          { outcome: 'miss' },
        ],
        negative: [
          { outcome: 'miss' },
          { outcome: 'miss' },
          { outcome: 'miss' },
        ],
      }),
    });

    const [pos, neg] = out.results;
    expect(pos).toMatchObject({
      triggers: 2,
      misses: 1,
      errors: 0,
      pass: true,
    });
    expect(neg).toMatchObject({
      triggers: 0,
      misses: 3,
      errors: 0,
      pass: true,
    });
    expect(out.summary).toMatchObject({ passed: 2, failed: 0, errored: 0 });
  });

  it('does not collapse duplicate query strings (keys by index)', async () => {
    const skill = makeSkill(tmp);
    const out = await runSet({
      evalSet: {
        skill_name: 'fake-skill',
        evals: [
          { query: 'same prompt', should_trigger: true },
          { query: 'same prompt', should_trigger: false },
        ],
      },
      skillPath: skill,
      runsPerQuery: 1,
      runQuery: vi
        .fn<(options: RunQueryOptions) => Promise<RunQueryResult>>()
        .mockResolvedValueOnce({
          outcome: 'trigger',
          triggerId: 't',
          durationMs: 1,
        })
        .mockResolvedValueOnce({
          outcome: 'miss',
          triggerId: 't',
          durationMs: 1,
        }),
    });

    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({
      triggers: 1,
      misses: 0,
      pass: true,
    });
    expect(out.results[1]).toMatchObject({
      triggers: 0,
      misses: 1,
      pass: true,
    });
  });

  it('excludes errored runs from precision/recall and surfaces them in summary.errored', async () => {
    const skill = makeSkill(tmp);
    const out = await runSet({
      evalSet: {
        skill_name: 'fake-skill',
        evals: [{ query: 'q', should_trigger: true }],
      },
      skillPath: skill,
      runsPerQuery: 3,
      runQuery: scriptedRunQuery({
        q: [
          { outcome: 'trigger' },
          { outcome: 'error', error: 'boom' },
          { outcome: 'trigger' },
        ],
      }),
    });

    const [r] = out.results;
    expect(r).toMatchObject({ triggers: 2, misses: 0, errors: 1, pass: true });
    // Trigger rate is computed over decided runs only (2 triggers / 2 decided).
    expect(r?.trigger_rate).toBe(1);
    expect(out.summary.errored).toBe(1);
  });

  it('fails a query when every run errored (no decided runs)', async () => {
    const skill = makeSkill(tmp);
    const out = await runSet({
      evalSet: {
        skill_name: 'fake-skill',
        evals: [{ query: 'q', should_trigger: true }],
      },
      skillPath: skill,
      runsPerQuery: 2,
      runQuery: scriptedRunQuery({
        q: [
          { outcome: 'error', error: 'spawn ENOENT' },
          { outcome: 'error', error: 'spawn ENOENT' },
        ],
      }),
    });

    const [r] = out.results;
    expect(r?.pass).toBe(false);
    expect(r?.trigger_rate).toBe(0);
    expect(out.summary.errored).toBe(1);
  });

  it('forwards progress events with run/query indices', async () => {
    const skill = makeSkill(tmp);
    const progress = vi.fn();
    await runSet({
      evalSet: {
        skill_name: 'fake-skill',
        evals: [
          { query: 'a', should_trigger: true },
          { query: 'b', should_trigger: false },
        ],
      },
      skillPath: skill,
      runsPerQuery: 2,
      onProgress: progress,
      runQuery: scriptedRunQuery({
        a: [{ outcome: 'trigger' }, { outcome: 'miss' }],
        b: [{ outcome: 'miss' }, { outcome: 'miss' }],
      }),
    });

    expect(progress).toHaveBeenCalledTimes(4);
    const events = progress.mock.calls.map((c: unknown[]) => c[0]);
    for (const e of events) {
      expect(e).toMatchObject({ totalQueries: 2, runsPerQuery: 2 });
    }
  });

  it('respects concurrency', async () => {
    const skill = makeSkill(tmp);
    let active = 0;
    let peak = 0;
    await runSet({
      evalSet: {
        skill_name: 'fake-skill',
        evals: Array.from({ length: 4 }, (_unused, i) => ({
          query: `q${i}`,
          should_trigger: true,
        })),
      },
      skillPath: skill,
      runsPerQuery: 1,
      concurrency: 2,
      runQuery: async (): Promise<RunQueryResult> => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active--;
        return { outcome: 'trigger', triggerId: 't', durationMs: 20 };
      },
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});
