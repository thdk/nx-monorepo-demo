import { writeFileSync } from 'node:fs';

import type { ConfigurationStats, OutputBenchmark } from '../types.js';

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function statsRow(label: string, stats: ConfigurationStats): string {
  const pr = `${pct(stats.pass_rate.mean)} ± ${pct(stats.pass_rate.stddev)}`;
  const time = `${stats.time_seconds.mean.toFixed(
    1
  )}s ± ${stats.time_seconds.stddev.toFixed(1)}s`;
  const tokens = `${stats.tokens.mean.toFixed(
    0
  )} ± ${stats.tokens.stddev.toFixed(0)}`;
  return `| ${label} | ${pr} | ${time} | ${tokens} |`;
}

export function renderOutputMarkdown(benchmark: OutputBenchmark): string {
  const lines: string[] = [];
  const meta = benchmark.metadata;

  lines.push(
    `# Skill Output Eval — \`${meta.skill_name}\``,
    '',
    `**Executor**: \`${meta.executor_model ?? '(default)'}\`  `,
    `**Grader**: \`${meta.grader_model}\`  `,
    `**Runs per configuration**: ${meta.runs_per_configuration}  `,
    `**Evals run**: ${meta.evals_run.join(', ') || '(none)'}`,
    '',
    '## Summary',
    '',
    '| Configuration | Pass rate | Time | Tokens |',
    '|---|---:|---:|---:|'
  );

  for (const [config, stats] of Object.entries(
    benchmark.run_summary.configurations
  )) {
    lines.push(statsRow(config.replace(/_/g, ' '), stats));
  }

  const delta = benchmark.run_summary.delta;
  if (delta) {
    lines.push(
      '',
      `**Delta (with_skill − without_skill)**: pass_rate ${delta.pass_rate}, time ${delta.time_seconds}s, tokens ${delta.tokens}`
    );
  }

  lines.push('', '## Per-eval breakdown', '');

  // Group by eval_name for the per-eval section
  const groupedByEval = new Map<string, typeof benchmark.runs>();
  for (const run of benchmark.runs) {
    const list = groupedByEval.get(run.eval_name) ?? [];
    list.push(run);
    groupedByEval.set(run.eval_name, list);
  }

  for (const [evalName, runs] of groupedByEval) {
    lines.push(`### \`${evalName}\``, '');
    lines.push(`> ${runs[0]?.query.replace(/\n/g, ' ') ?? ''}`, '');

    for (const run of runs) {
      lines.push(
        `**${run.configuration} · run ${run.run_number}** — ${(
          run.execution.duration_ms / 1000
        ).toFixed(1)}s, ${run.execution.usage.total_tokens} tokens`
      );

      if (!run.execution.ok) {
        lines.push('', '```');
        lines.push(run.execution.error ?? 'execution failed');
        lines.push('```', '');
        continue;
      }
      if (!run.grading) {
        lines.push('  ⚠ grader did not run', '');
        continue;
      }
      lines.push(
        `  → ${run.grading.summary.passed}/${
          run.grading.summary.total
        } expectations passed (${pct(run.grading.summary.pass_rate)})`,
        ''
      );
      for (const exp of run.grading.expectations) {
        const mark = exp.passed ? '✓' : '✗';
        lines.push(`  - ${mark} ${exp.text}`);
        lines.push(`    > ${exp.evidence}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function writeOutputMarkdownReport(
  path: string,
  benchmark: OutputBenchmark
): void {
  writeFileSync(path, renderOutputMarkdown(benchmark));
}
