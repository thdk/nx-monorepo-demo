export interface EvalItem {
  query: string;
  should_trigger: boolean;
}

export interface EvalSet {
  skill_name: string;
  evals: EvalItem[];
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
