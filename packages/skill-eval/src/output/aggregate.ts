import type { ConfigurationStats, OutputEvalRun } from '../types.js';

export function calculateStats(values: number[]): { mean: number; stddev: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, stddev: 0, min: 0, max: 0 };
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stddev = Math.sqrt(variance);
  return {
    mean: Number(mean.toFixed(4)),
    stddev: Number(stddev.toFixed(4)),
    min: Number(Math.min(...values).toFixed(4)),
    max: Number(Math.max(...values).toFixed(4)),
  };
}

export function aggregateRuns(runs: OutputEvalRun[]): Record<string, ConfigurationStats> {
  const grouped = new Map<string, OutputEvalRun[]>();
  for (const r of runs) {
    const list = grouped.get(r.configuration) ?? [];
    list.push(r);
    grouped.set(r.configuration, list);
  }

  const result: Record<string, ConfigurationStats> = {};
  for (const [config, list] of grouped) {
    const passRates = list.map((r) => r.grading?.summary.pass_rate ?? 0);
    const times = list.map((r) => r.execution.duration_ms / 1000);
    const tokens = list.map((r) => r.execution.usage.total_tokens);

    result[config] = {
      pass_rate: calculateStats(passRates),
      time_seconds: calculateStats(times),
      tokens: calculateStats(tokens),
    };
  }
  return result;
}

export function computeDelta(
  stats: Record<string, ConfigurationStats>,
): { pass_rate: string; time_seconds: string; tokens: string } | undefined {
  const withSkill = stats['with_skill'];
  const withoutSkill = stats['without_skill'];
  if (!withSkill || !withoutSkill) return undefined;

  const pr = withSkill.pass_rate.mean - withoutSkill.pass_rate.mean;
  const t = withSkill.time_seconds.mean - withoutSkill.time_seconds.mean;
  const tok = withSkill.tokens.mean - withoutSkill.tokens.mean;

  return {
    pass_rate: `${pr >= 0 ? '+' : ''}${pr.toFixed(2)}`,
    time_seconds: `${t >= 0 ? '+' : ''}${t.toFixed(1)}`,
    tokens: `${tok >= 0 ? '+' : ''}${tok.toFixed(0)}`,
  };
}
