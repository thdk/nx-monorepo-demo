import { writeFileSync } from 'node:fs';

import type { TriggerRunOutput } from '../types.js';

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function renderMarkdown(output: TriggerRunOutput): string {
  const { summary, results } = output;
  const lines = [
    `# Skill Trigger Eval — \`${output.skill_name}\``,
    '',
    `**Model**: \`${output.model ?? '(default)'}\`  `,
    `**Runs per query**: ${output.runs_per_query}  `,
    `**Threshold**: ${pct(output.trigger_threshold)}`,
    '',
    '## Summary',
    '',
    `| Total | Passed | Failed | Errored | Precision | Recall | Accuracy |`,
    `|---:|---:|---:|---:|---:|---:|---:|`,
    `| ${summary.total} | ${summary.passed} | ${summary.failed} | ${
      summary.errored
    } | ${pct(summary.precision)} | ${pct(summary.recall)} | ${pct(
      summary.accuracy
    )} |`,
    '',
    '## Per-query results',
    '',
    '| Status | Expected | Trigger rate | Errors | Query |',
    '|:---:|:---:|---:|---:|---|',
  ];

  for (const r of results) {
    const status = r.pass ? '✓' : r.errors === r.runs ? '!' : '✗';
    const expected = r.should_trigger ? 'trigger' : 'no-trigger';
    const denom = r.triggers + r.misses;
    const rate =
      denom > 0 ? `${r.triggers}/${denom} (${pct(r.trigger_rate)})` : '—';
    const query = r.query.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${status} | ${expected} | ${rate} | ${r.errors} | ${query} |`
    );
  }

  const erroredResults = results.filter((r) => r.errors > 0);
  if (erroredResults.length > 0) {
    lines.push('', '## Errored runs', '');
    for (const r of erroredResults) {
      lines.push(`### \`${r.query.replace(/\n/g, ' ').slice(0, 100)}\``, '');
      const errored = r.records.filter((rec) => rec.outcome === 'error');
      errored.forEach((rec, i) => {
        lines.push(
          `Run ${i + 1}:`,
          '',
          '```',
          rec.error ?? 'unknown error',
          '```',
          ''
        );
      });
    }
  }

  return [...lines, ''].join('\n');
}

export function writeMarkdownReport(
  path: string,
  output: TriggerRunOutput
): void {
  writeFileSync(path, renderMarkdown(output));
}
