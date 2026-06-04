import { writeFileSync } from 'node:fs';

import type { OutputBenchmark, OutputEvalRun } from '../types.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function suiteTime(run: OutputEvalRun): string {
  return (run.execution.duration_ms / 1000).toFixed(3);
}

function renderRunSuite(run: OutputEvalRun, skillName: string): {
  xml: string;
  tests: number;
  failures: number;
  errors: number;
} {
  const className = `skill-eval.output.${skillName}.${run.eval_name}.${run.configuration}`;
  const time = suiteTime(run);

  if (!run.execution.ok) {
    const msg = escapeXml(`executor failed: ${run.execution.error ?? 'unknown error'}`);
    const xml = `  <testsuite name="${escapeXml(`${run.eval_name}/${run.configuration}/run-${run.run_number}`)}" tests="1" failures="0" errors="1" time="${time}">
    <testcase classname="${escapeXml(className)}" name="execution" time="${time}">
      <error message="${msg}">${msg}</error>
    </testcase>
  </testsuite>`;
    return { xml, tests: 1, failures: 0, errors: 1 };
  }

  if (!run.grading) {
    const xml = `  <testsuite name="${escapeXml(`${run.eval_name}/${run.configuration}/run-${run.run_number}`)}" tests="1" failures="0" errors="1" time="${time}">
    <testcase classname="${escapeXml(className)}" name="grading" time="${time}">
      <error message="grader did not run">grader did not run — see transcript for the executor output</error>
    </testcase>
  </testsuite>`;
    return { xml, tests: 1, failures: 0, errors: 1 };
  }

  const cases = run.grading.expectations.map((exp) => {
    const name = escapeXml(exp.text.slice(0, 200));
    if (exp.passed) {
      return `    <testcase classname="${escapeXml(className)}" name="${name}" time="0"/>`;
    }
    const msg = escapeXml(exp.evidence || 'expectation failed');
    return `    <testcase classname="${escapeXml(className)}" name="${name}" time="0">
      <failure message="${msg}">${msg}</failure>
    </testcase>`;
  });

  const failures = run.grading.summary.failed;
  const tests = run.grading.summary.total;

  const xml = `  <testsuite name="${escapeXml(`${run.eval_name}/${run.configuration}/run-${run.run_number}`)}" tests="${tests}" failures="${failures}" errors="0" time="${time}">
${cases.join('\n')}
  </testsuite>`;
  return { xml, tests, failures, errors: 0 };
}

export function renderOutputJunit(benchmark: OutputBenchmark): string {
  const skillName = benchmark.metadata.skill_name;
  const suites = benchmark.runs.map((r) => renderRunSuite(r, skillName));
  const totals = suites.reduce(
    (acc, s) => ({
      tests: acc.tests + s.tests,
      failures: acc.failures + s.failures,
      errors: acc.errors + s.errors,
    }),
    { tests: 0, failures: 0, errors: 0 },
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="skill-eval-output" tests="${totals.tests}" failures="${totals.failures}" errors="${totals.errors}">
${suites.map((s) => s.xml).join('\n')}
</testsuites>
`;
}

export function writeOutputJunitReport(path: string, benchmark: OutputBenchmark): void {
  writeFileSync(path, renderOutputJunit(benchmark));
}
