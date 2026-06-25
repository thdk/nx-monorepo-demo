export interface EvalItem {
  query: string;
  should_trigger: boolean;
  /** Stable identifier for cross-iteration comparison; optional. */
  id?: number;
  /** Short human-readable name for display in benchmarks/reports. */
  name?: string;
  /**
   * Expectations to check against the model's response (output-eval mode).
   * If absent or empty, the eval is skipped by `skill-eval output`.
   */
  expectations?: string[];
  /**
   * Per-eval timeout in seconds, overriding the CLI default for this query
   * only (`--timeout` for `trigger`, `--executor-timeout` for `output`).
   * Useful when a single query legitimately needs longer than the rest.
   */
  timeout?: number;
}

export interface EvalSet {
  skill_name: string;
  evals: EvalItem[];
}

// ---------------------------------------------------------------------------
// Output eval types
// ---------------------------------------------------------------------------

export interface ExecutionUsage {
  input_tokens: number;
  output_tokens: number;
  /** Approximate total — input + output for now. */
  total_tokens: number;
}

export interface ToolUseSummary {
  name: string;
  count: number;
}

export interface ExecutionResult {
  /** The final assistant text (what the user would see). */
  final_text: string;
  /** Per-tool counts across the run. */
  tool_uses: ToolUseSummary[];
  /** Files written by the model under the workdir (relative paths, excluding .claude/). */
  output_files: string[];
  usage: ExecutionUsage;
  duration_ms: number;
  /** True iff the executor reached a result event (clean termination). */
  ok: boolean;
  /** Populated when ok = false. */
  error?: string;
}

export interface ExpectationGrade {
  text: string;
  passed: boolean;
  evidence: string;
}

export interface GradingResult {
  expectations: ExpectationGrade[];
  summary: {
    passed: number;
    failed: number;
    total: number;
    pass_rate: number;
  };
}

export interface OutputEvalRun {
  eval_id: number;
  eval_name: string;
  query: string;
  configuration: 'with_skill' | 'without_skill';
  run_number: number;
  execution: ExecutionResult;
  grading: GradingResult | null;
}

export interface StatSummary {
  mean: number;
  stddev: number;
  min: number;
  max: number;
}

export interface ConfigurationStats {
  pass_rate: StatSummary;
  time_seconds: StatSummary;
  tokens: StatSummary;
}

export interface DeltaSummary {
  pass_rate: string;
  time_seconds: string;
  tokens: string;
}

export interface OutputRunSummary {
  configurations: Record<string, ConfigurationStats>;
  delta?: DeltaSummary;
}

export interface OutputBenchmark {
  metadata: {
    skill_name: string;
    skill_path: string;
    executor_model: string | null;
    grader_model: string;
    timestamp: string;
    evals_run: number[];
    runs_per_configuration: number;
  };
  runs: OutputEvalRun[];
  run_summary: OutputRunSummary;
}

export type RunOutcome = 'trigger' | 'miss' | 'error';

export interface RunRecord {
  outcome: RunOutcome;
  duration_ms: number;
  error?: string;
}

export interface QueryResult {
  query: string;
  should_trigger: boolean;
  triggers: number;
  misses: number;
  errors: number;
  runs: number;
  trigger_rate: number;
  pass: boolean;
  records: RunRecord[];
}

export interface TriggerSummary {
  total: number;
  passed: number;
  failed: number;
  /** Queries with at least one errored run that didn't complete normally. */
  errored: number;
  precision: number;
  recall: number;
  accuracy: number;
}

export interface TriggerRunOutput {
  skill_name: string;
  description: string;
  model: string | null;
  runs_per_query: number;
  trigger_threshold: number;
  results: QueryResult[];
  summary: TriggerSummary;
}

export interface SkillMeta {
  name: string;
  description: string;
}
