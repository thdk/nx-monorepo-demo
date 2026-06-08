import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import pLimit from 'p-limit';

import type {
  EvalItem,
  EvalSet,
  GradingResult,
  OutputBenchmark,
  OutputEvalRun,
} from '../types.js';
import { parseSkillMd } from '../util/parse-skill-md.js';

import { aggregateRuns, computeDelta } from './aggregate.js';
import { executeQuery, type ExecutorOptions } from './executor.js';
import {
  gradeExecution,
  type GradeOptions,
  type GraderMode,
} from './grader.js';

export interface OutputRunSetOptions {
  evalSet: EvalSet;
  skillPath: string;
  executorModel?: string | null;
  graderModel: string;
  /** 'claude-p' (default) reuses Claude Code's local auth; 'api' uses the Anthropic SDK directly. */
  graderMode?: GraderMode;
  runsPerConfiguration?: number;
  concurrency?: number;
  /** Also run a without_skill baseline for each eval. */
  baseline?: boolean;
  /** Output directory: each eval gets its own subdir for transcripts + grading. */
  workspaceDir?: string;
  executorTimeoutMs?: number;
  claudeBin?: string;
  /** DI seam — override the executor (for tests). */
  executor?: (
    options: ExecutorOptions
  ) => Promise<import('../types.js').ExecutionResult>;
  /** DI seam — override the grader (for tests). */
  grader?: (options: GradeOptions) => Promise<GradingResult>;
  onProgress?: (event: OutputProgressEvent) => void;
}

export interface OutputProgressEvent {
  evalIndex: number;
  evalName: string;
  configuration: 'with_skill' | 'without_skill';
  runNumber: number;
  phase:
    | 'execute-start'
    | 'execute-end'
    | 'grade-start'
    | 'grade-end'
    | 'skipped';
  durationMs?: number;
  passRate?: number;
  /** Populated on `execute-end` — total tokens consumed by the executor run. */
  tokens?: number;
  error?: string;
}

function evalsWithExpectations(
  evals: EvalItem[]
): Array<{ index: number; item: EvalItem }> {
  return evals
    .map((item, index) => ({ index, item }))
    .filter(
      ({ item }) => item.should_trigger && (item.expectations?.length ?? 0) > 0
    );
}

function nameFor(item: EvalItem, index: number): string {
  return item.name ?? (item.id != null ? `eval-${item.id}` : `eval-${index}`);
}

function idFor(item: EvalItem, index: number): number {
  return item.id ?? index;
}

export async function runOutputSet(
  options: OutputRunSetOptions
): Promise<OutputBenchmark> {
  const {
    evalSet,
    skillPath,
    executorModel = null,
    graderModel,
    graderMode = 'claude-p',
    runsPerConfiguration = 1,
    concurrency = 3,
    baseline = false,
    workspaceDir,
    executorTimeoutMs,
    claudeBin,
    executor = executeQuery,
    grader = gradeExecution,
    onProgress,
  } = options;

  const skill = parseSkillMd(skillPath);
  const limit = pLimit(concurrency);
  const targets = evalsWithExpectations(evalSet.evals);

  if (workspaceDir) mkdirSync(workspaceDir, { recursive: true });

  const configs: Array<'with_skill' | 'without_skill'> = baseline
    ? ['with_skill', 'without_skill']
    : ['with_skill'];

  const tasks: Array<Promise<OutputEvalRun>> = [];

  for (const { index, item } of targets) {
    const evalName = nameFor(item, index);
    const evalId = idFor(item, index);
    const expectations = item.expectations ?? [];

    for (const configuration of configs) {
      for (let runNumber = 1; runNumber <= runsPerConfiguration; runNumber++) {
        tasks.push(
          limit(async (): Promise<OutputEvalRun> => {
            const runDir = workspaceDir
              ? join(workspaceDir, evalName, configuration, `run-${runNumber}`)
              : undefined;

            onProgress?.({
              evalIndex: index,
              evalName,
              configuration,
              runNumber,
              phase: 'execute-start',
            });

            const execStarted = Date.now();
            const execution = await executor({
              query: item.query,
              skillPath,
              skillName: skill.name,
              baseline: configuration === 'without_skill',
              timeoutMs: executorTimeoutMs,
              model: executorModel,
              claudeBin,
              artifactsDir: runDir,
            });

            onProgress?.({
              evalIndex: index,
              evalName,
              configuration,
              runNumber,
              phase: 'execute-end',
              durationMs: Date.now() - execStarted,
              tokens: execution.usage.total_tokens,
              error: execution.ok ? undefined : execution.error,
            });

            let grading: GradingResult | null = null;
            if (execution.ok && execution.final_text.length > 0) {
              onProgress?.({
                evalIndex: index,
                evalName,
                configuration,
                runNumber,
                phase: 'grade-start',
              });
              try {
                grading = await grader({
                  query: item.query,
                  expectations,
                  execution,
                  graderModel,
                  mode: graderMode,
                  claudeBin,
                });
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : String(err);
                onProgress?.({
                  evalIndex: index,
                  evalName,
                  configuration,
                  runNumber,
                  phase: 'grade-end',
                  error: `grader failed: ${message}`,
                });
              }
              if (grading) {
                onProgress?.({
                  evalIndex: index,
                  evalName,
                  configuration,
                  runNumber,
                  phase: 'grade-end',
                  passRate: grading.summary.pass_rate,
                });
              }
            } else {
              onProgress?.({
                evalIndex: index,
                evalName,
                configuration,
                runNumber,
                phase: 'skipped',
                error: execution.error ?? 'no final text from executor',
              });
            }

            if (runDir && grading) {
              writeFileSync(
                join(runDir, 'grading.json'),
                JSON.stringify(grading, null, 2)
              );
            }

            return {
              eval_id: evalId,
              eval_name: evalName,
              query: item.query,
              configuration,
              run_number: runNumber,
              execution,
              grading,
            };
          })
        );
      }
    }
  }

  const runs = await Promise.all(tasks);
  const configurations = aggregateRuns(runs);
  const delta = computeDelta(configurations);

  return {
    metadata: {
      skill_name: skill.name,
      skill_path: skillPath,
      executor_model: executorModel,
      grader_model: graderModel,
      timestamp: new Date().toISOString(),
      evals_run: Array.from(new Set(runs.map((r) => r.eval_id))).sort(
        (a, b) => a - b
      ),
      runs_per_configuration: runsPerConfiguration,
    },
    runs,
    run_summary: delta ? { configurations, delta } : { configurations },
  };
}
