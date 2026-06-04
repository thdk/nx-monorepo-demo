import { writeFileSync } from 'node:fs';

import type { QueryResult, TriggerRunOutput } from '../types.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function caseName(result: QueryResult): string {
  const polarity = result.should_trigger ? 'should-trigger' : 'should-not-trigger';
  const snippet = result.query.replace(/\s+/g, ' ').slice(0, 80);
  return `[${polarity}] ${snippet}`;
}

function failureMessage(result: QueryResult): string {
  const pct = (result.trigger_rate * 100).toFixed(0);
  const ratio = `${result.triggers}/${result.triggers + result.misses}`;
  const errSuffix = result.errors > 0 ? ` [${result.errors} errored]` : '';
  return result.should_trigger
    ? `Expected to trigger but rate was ${pct}% (${ratio})${errSuffix}`
    : `Expected NOT to trigger but rate was ${pct}% (${ratio})${errSuffix}`;
}

function caseTimeSeconds(result: QueryResult): string {
  const totalMs = result.records.reduce((sum, r) => sum + r.duration_ms, 0);
  return (totalMs / 1000).toFixed(3);
}

function errorBlock(result: QueryResult): string {
  const errored = result.records.filter((r) => r.outcome === 'error');
  if (errored.length === 0) return '';
  const messages = errored
    .map((r, i) => `Run ${i + 1}: ${r.error ?? 'unknown error'}`)
    .join('\n\n');
  return `<error message="${escapeXml(errored.length + ' run(s) errored')}">${escapeXml(messages)}</error>`;
}

export function renderJunit(output: TriggerRunOutput): string {
  const testcases = output.results
    .map((r) => {
      const name = escapeXml(caseName(r));
      const classname = escapeXml(`skill-eval.trigger.${output.skill_name}`);
      const time = caseTimeSeconds(r);
      const errors = errorBlock(r);
      if (r.pass && !errors) {
        return `    <testcase classname="${classname}" name="${name}" time="${time}"/>`;
      }
      const inner: string[] = [];
      if (!r.pass) {
        const msg = escapeXml(failureMessage(r));
        inner.push(`      <failure message="${msg}">${msg}</failure>`);
      }
      if (errors) {
        inner.push(`      ${errors}`);
      }
      return `    <testcase classname="${classname}" name="${name}" time="${time}">
${inner.join('\n')}
    </testcase>`;
    })
    .join('\n');

  const { summary } = output;
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="skill-eval">
  <testsuite name="trigger:${escapeXml(output.skill_name)}" tests="${summary.total}" failures="${summary.failed}" errors="${summary.errored}" skipped="0">
${testcases}
  </testsuite>
</testsuites>
`;
}

export function writeJunitReport(path: string, output: TriggerRunOutput): void {
  writeFileSync(path, renderJunit(output));
}
