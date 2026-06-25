import pLimit from 'p-limit';

import type {
  EvalItem,
  EvalSet,
  QueryResult,
  RunRecord,
  TriggerRunOutput,
  TriggerSummary,
} from '../types.js';
import { parseSkillMd } from '../util/parse-skill-md.js';

import {
  runQuery as defaultRunQuery,
  type RunQueryOptions,
  type RunQueryResult,
} from './run-query.js';

export interface RunSetOptions {
  evalSet: EvalSet;
  skillPath: string;
  model?: string | null;
  runsPerQuery?: number;
  concurrency?: number;
  triggerThreshold?: number;
  timeoutMs?: number;
  claudeBin?: string;
  /**
   * Optional shared project root. If omitted, each runQuery gets its own
   * isolated tempdir (recommended for concurrency > 1).
   */
  projectRoot?: string;
  onProgress?: (event: ProgressEvent) => void;
  /** Test/DI seam — override the per-query runner. */
  runQuery?: (options: RunQueryOptions) => Promise<RunQueryResult>;
}

export interface ProgressEvent {
  queryIndex: number;
  totalQueries: number;
  runIndex: number;
  runsPerQuery: number;
  query: string;
  outcome: RunRecord['outcome'];
  durationMs: number;
  error?: string;
}

function computeSummary(results: QueryResult[]): TriggerSummary {
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;

  for (const r of results) {
    // Errors are excluded from precision/recall denominators — they're
    // infrastructure failures, not model decisions.
    if (r.should_trigger) {
      tp += r.triggers;
      fn += r.misses;
    } else {
      fp += r.triggers;
      tn += r.misses;
    }
  }

  const totalRuns = tp + fn + fp + tn;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const accuracy = totalRuns > 0 ? (tp + tn) / totalRuns : 0;

  const passed = results.filter((r) => r.pass).length;
  const errored = results.filter((r) => r.errors > 0).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    errored,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    accuracy: Number(accuracy.toFixed(4)),
  };
}

export async function runSet(
  options: RunSetOptions
): Promise<TriggerRunOutput> {
  const {
    evalSet,
    skillPath,
    model = null,
    runsPerQuery = 3,
    concurrency = 5,
    triggerThreshold = 0.5,
    timeoutMs,
    claudeBin,
    projectRoot,
    onProgress,
    runQuery = defaultRunQuery,
  } = options;

  const skill = parseSkillMd(skillPath);
  const limit = pLimit(concurrency);

  const recordsByIndex: RunRecord[][] = evalSet.evals.map(() => []);

  const tasks = evalSet.evals.flatMap((item: EvalItem, queryIndex) => {
    const bucket = recordsByIndex[queryIndex];
    if (!bucket)
      throw new Error(`internal: missing bucket for index ${queryIndex}`);
    // Per-eval timeout (seconds) overrides the CLI default for this query only.
    const itemTimeoutMs =
      item.timeout != null ? item.timeout * 1000 : timeoutMs;
    return Array.from({ length: runsPerQuery }, (_unused, runIndex) =>
      limit(async () => {
        const result = await runQuery({
          query: item.query,
          skillName: skill.name,
          skillDescription: skill.description,
          projectRoot,
          model,
          timeoutMs: itemTimeoutMs,
          claudeBin,
        });

        const record: RunRecord = {
          outcome: result.outcome,
          duration_ms: result.durationMs,
          ...(result.error ? { error: result.error } : {}),
        };
        bucket.push(record);

        onProgress?.({
          queryIndex,
          totalQueries: evalSet.evals.length,
          runIndex,
          runsPerQuery,
          query: item.query,
          outcome: record.outcome,
          durationMs: result.durationMs,
          error: record.error,
        });
      })
    );
  });

  await Promise.all(tasks);

  const results: QueryResult[] = evalSet.evals.map((item, idx) => {
    const records = recordsByIndex[idx] ?? [];
    const triggers = records.filter((r) => r.outcome === 'trigger').length;
    const misses = records.filter((r) => r.outcome === 'miss').length;
    const errors = records.filter((r) => r.outcome === 'error').length;
    const denom = triggers + misses;
    const triggerRate = denom > 0 ? triggers / denom : 0;
    const pass =
      denom === 0
        ? false
        : item.should_trigger
        ? triggerRate >= triggerThreshold
        : triggerRate < triggerThreshold;
    return {
      query: item.query,
      should_trigger: item.should_trigger,
      triggers,
      misses,
      errors,
      runs: records.length,
      trigger_rate: Number(triggerRate.toFixed(4)),
      pass,
      records,
    };
  });

  return {
    skill_name: skill.name,
    description: skill.description,
    model,
    runs_per_query: runsPerQuery,
    trigger_threshold: triggerThreshold,
    results,
    summary: computeSummary(results),
  };
}
